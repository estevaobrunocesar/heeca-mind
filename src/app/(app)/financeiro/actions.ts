"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canViewFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { getAppointmentInTenant } from "@/lib/tenant";
import { dateTimeInTz } from "@/lib/time";
import { registerPaymentSchema } from "@/lib/validation/payment";
import type { PaymentMethod } from "@/generated/prisma/enums";

async function ctx(appointmentId: string) {
  const actor = await requireActor();
  const appointment = await getAppointmentInTenant(actor, appointmentId);
  if (!canViewFinancials(actor, appointment.professionalId)) throw new Error("Sem permissão para o financeiro");
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  return { actor, appointment, tz: org.timezone };
}

function revalidate(appointmentId: string) {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath(`/agenda/${appointmentId}`);
}

/**
 * Registra um pagamento. Cria a linha em `Payment` (histórico) e marca a
 * sessão como PAID. Um pagamento parcial deixa a sessão PENDING até a soma
 * atingir o valor.
 */
export async function registerPaymentAction(appointmentId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, appointment, tz } = await ctx(appointmentId);
  const parsed = registerPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const already = await db.payment.aggregate({ where: { appointmentId }, _sum: { amountCents: true } });
  const paidSoFar = already._sum.amountCents ?? 0;
  const amount = d.amount ?? Math.max(0, appointment.priceCents - paidSoFar);
  if (amount <= 0) return { error: "Esta sessão já está quitada.", values: formValues(formData) };

  const paidAt = d.paidAt ? dateTimeInTz(d.paidAt, "12:00", tz) : new Date();
  const total = paidSoFar + amount;
  const settled = total >= appointment.priceCents;

  await db.$transaction([
    db.payment.create({ data: { appointmentId, amountCents: amount, method: d.method, paidAt, note: d.note } }),
    db.appointment.update({
      where: { id: appointmentId },
      data: settled
        ? { paymentStatus: "PAID", paymentMethod: d.method, paidAt }
        : { paymentMethod: d.method },
    }),
  ]);

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "payment.register",
    entityType: "Appointment",
    entityId: appointmentId,
    after: { amountCents: amount, method: d.method, settled },
  });

  revalidate(appointmentId);
  return { ok: true };
}

/** Atalho da lista: quita o valor integral com a forma indicada. */
export async function quickPayAction(appointmentId: string, method: PaymentMethod) {
  const fd = new FormData();
  fd.set("method", method);
  fd.set("amount", "");
  fd.set("paidAt", "");
  fd.set("note", "");
  const r = await registerPaymentAction(appointmentId, {}, fd);
  if (r.error) throw new Error(r.error);
}

/** Isenta a sessão (cortesia, reposição). Não cria Payment. */
export async function waivePaymentAction(appointmentId: string) {
  const { actor } = await ctx(appointmentId);
  await db.appointment.update({ where: { id: appointmentId }, data: { paymentStatus: "WAIVED", paymentMethod: null, paidAt: null } });
  await audit(actor, { organizationId: actor.organizationId, action: "payment.waive", entityType: "Appointment", entityId: appointmentId });
  revalidate(appointmentId);
}

/** Desfaz: apaga os pagamentos e volta para PENDING. */
export async function revertPaymentAction(appointmentId: string) {
  const { actor } = await ctx(appointmentId);
  const payments = await db.payment.findMany({ where: { appointmentId } });
  await db.$transaction([
    db.payment.deleteMany({ where: { appointmentId } }),
    db.appointment.update({ where: { id: appointmentId }, data: { paymentStatus: "PENDING", paymentMethod: null, paidAt: null } }),
  ]);
  await audit(actor, { organizationId: actor.organizationId, action: "payment.revert", entityType: "Appointment", entityId: appointmentId, before: payments });
  revalidate(appointmentId);
}
