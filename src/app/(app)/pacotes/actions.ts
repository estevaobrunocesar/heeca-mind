"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { cancelPurchase, getPurchaseInTenant, linkAppointment, revertConsumption, sellPackage, unlinkAppointment } from "@/lib/packages/service";
import { canEditProfessional, canManageSchedule, canViewFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { getAppointmentInTenant } from "@/lib/tenant";
import { dateTimeInTz } from "@/lib/time";
import { packageSchema, reasonSchema, sellPackageSchema } from "@/lib/validation/package";
import { registerPaymentSchema } from "@/lib/validation/payment";

// ── Catálogo (dono do perfil ou OWNER) ──────────────────────────────────────

async function catalogCtx() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) throw new Error("Usuário sem perfil profissional");
  if (!canEditProfessional(actor, actor.activeProfessionalId)) throw new Error("Sem permissão");
  return { actor, professionalId: actor.activeProfessionalId };
}

async function ownedPackage(actor: Awaited<ReturnType<typeof catalogCtx>>["actor"], professionalId: string, id: string) {
  const p = await db.package.findFirst({ where: { id, professionalId, organizationId: actor.organizationId } });
  if (!p) throw new Error("Pacote não encontrado");
  return p;
}

/** Serviços cobertos precisam ser do mesmo profissional — o formulário lista só esses, o servidor confere. */
async function validServiceIds(professionalId: string, ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.service.findMany({ where: { id: { in: ids }, professionalId }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function createPackageAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await catalogCtx();
  const parsed = packageSchema.safeParse({ ...Object.fromEntries(formData), serviceIds: formData.getAll("serviceIds") });
  if (!parsed.success) return invalid(parsed.error, formData);
  const { price, serviceIds, ...data } = parsed.data;
  const last = await db.package.findFirst({ where: { professionalId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const pkg = await db.package.create({
    data: { ...data, priceCents: price, serviceIds: await validServiceIds(professionalId, serviceIds), organizationId: actor.organizationId, professionalId, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });
  await audit(actor, { organizationId: actor.organizationId, action: "package.create", entityType: "Package", entityId: pkg.id, after: pkg });
  revalidatePath("/pacotes");
  redirect("/pacotes");
}

export async function updatePackageAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await catalogCtx();
  const before = await ownedPackage(actor, professionalId, id);
  const parsed = packageSchema.safeParse({ ...Object.fromEntries(formData), serviceIds: formData.getAll("serviceIds") });
  if (!parsed.success) return invalid(parsed.error, formData);
  const { price, serviceIds, ...data } = parsed.data;
  // Vendas já feitas guardam snapshot (sessões, preço, cobertura): mudar o catálogo não as altera.
  const after = await db.package.update({ where: { id }, data: { ...data, priceCents: price, serviceIds: await validServiceIds(professionalId, serviceIds) } });
  await audit(actor, { organizationId: actor.organizationId, action: "package.update", entityType: "Package", entityId: id, before, after });
  revalidatePath("/pacotes");
  redirect("/pacotes");
}

export async function togglePackageAction(id: string) {
  const { actor, professionalId } = await catalogCtx();
  const p = await ownedPackage(actor, professionalId, id);
  await db.package.update({ where: { id }, data: { isActive: !p.isActive } });
  await audit(actor, { organizationId: actor.organizationId, action: p.isActive ? "package.deactivate" : "package.activate", entityType: "Package", entityId: id });
  revalidatePath("/pacotes");
}

// ── Venda e ciclo de vida (agenda/recepção; valores só para quem vê financeiro) ──

export async function sellPackageAction(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (!actor.activeProfessionalId || !canManageSchedule(actor, actor.activeProfessionalId)) return { error: "Sem permissão para vender pacotes." };
  const parsed = sellPackageSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    await sellPackage(actor, { patientId, packageId: parsed.data.packageId, note: parsed.data.note });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível vender o pacote.", values: formValues(formData) };
  }
  revalidatePath(`/pacientes/${patientId}`);
  revalidatePath("/financeiro");
  return { ok: true };
}

export async function cancelPurchaseAction(purchaseId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const p = await getPurchaseInTenant(actor, purchaseId);
  if (!canManageSchedule(actor, p.professionalId)) return { error: "Sem permissão." };
  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  await cancelPurchase(actor, purchaseId, parsed.data.reason);
  revalidatePath(`/pacientes/${p.patientId}`);
  revalidatePath("/financeiro");
  return { ok: true };
}

/** Pagamento do pacote: mesma forma do pagamento de sessão (Payment.packagePurchaseId). */
export async function registerPackagePaymentAction(purchaseId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const p = await getPurchaseInTenant(actor, purchaseId);
  if (!canViewFinancials(actor, p.professionalId)) return { error: "Sem permissão para o financeiro." };
  const parsed = registerPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const paidSoFar = p.payments.reduce((s, x) => s + x.amountCents, 0);
  const amount = d.amount ?? Math.max(0, p.priceCents - paidSoFar);
  if (amount <= 0) return { error: "Este pacote já está quitado.", values: formValues(formData) };
  const paidAt = d.paidAt ? dateTimeInTz(d.paidAt, "12:00", org.timezone) : new Date();
  const settled = paidSoFar + amount >= p.priceCents;
  await db.$transaction([
    db.payment.create({ data: { packagePurchaseId: p.id, amountCents: amount, method: d.method, paidAt, note: d.note } }),
    db.packagePurchase.update({ where: { id: p.id }, data: settled ? { paymentStatus: "PAID" } : {} }),
  ]);
  await audit(actor, { organizationId: actor.organizationId, action: "payment.register", entityType: "PackagePurchase", entityId: p.id, after: { amountCents: amount, method: d.method, settled } });
  revalidatePath(`/pacientes/${p.patientId}`);
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function quickPayPackageAction(purchaseId: string, method: PaymentMethod) {
  const fd = new FormData();
  fd.set("method", method);
  fd.set("amount", "");
  fd.set("paidAt", "");
  fd.set("note", "");
  const r = await registerPackagePaymentAction(purchaseId, {}, fd);
  if (r.error) throw new Error(r.error);
}

export async function revertPackagePaymentAction(purchaseId: string) {
  const actor = await requireActor();
  const p = await getPurchaseInTenant(actor, purchaseId);
  if (!canViewFinancials(actor, p.professionalId)) throw new Error("Sem permissão para o financeiro");
  await db.$transaction([
    db.payment.deleteMany({ where: { packagePurchaseId: p.id } }),
    db.packagePurchase.update({ where: { id: p.id }, data: { paymentStatus: "PENDING" } }),
  ]);
  await audit(actor, { organizationId: actor.organizationId, action: "payment.revert", entityType: "PackagePurchase", entityId: p.id, before: p.payments });
  revalidatePath(`/pacientes/${p.patientId}`);
  revalidatePath("/financeiro");
}

// ── Sessão × pacote ─────────────────────────────────────────────────────────

export async function linkAppointmentToPackageAction(appointmentId: string, purchaseId: string) {
  const actor = await requireActor();
  const a = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, a.professionalId)) throw new Error("Sem permissão");
  await linkAppointment(actor, appointmentId, purchaseId);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath(`/pacientes/${a.patientId}`);
  revalidatePath("/financeiro");
}

export async function unlinkAppointmentFromPackageAction(appointmentId: string) {
  const actor = await requireActor();
  const a = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, a.professionalId)) throw new Error("Sem permissão");
  await unlinkAppointment(actor, appointmentId);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath(`/pacientes/${a.patientId}`);
  revalidatePath("/financeiro");
}

export async function revertConsumptionAction(appointmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const a = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, a.professionalId)) return { error: "Sem permissão." };
  const parsed = reasonSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  await revertConsumption(actor, appointmentId, parsed.data.reason);
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath(`/pacientes/${a.patientId}`);
  return { ok: true };
}
