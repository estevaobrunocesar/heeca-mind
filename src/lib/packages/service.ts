import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import type { Actor } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { balance, canLink, consumeReasonFor, effectiveStatus, expiresAtFor, type ConsumeReason } from "./rules";

/**
 * Pacotes de sessões — parte com banco (docs/mind/03-FLUXOS.md F8).
 * Regras puras em ./rules.ts. Aqui: venda, vínculo com a sessão, consumo (idempotente por
 * appointmentId), reversão, expiração no cron e leitura para a ficha.
 *
 * Invariantes:
 *  - Sessão vinculada tem paymentStatus = PACKAGE e não entra em "a receber"; a receita é a venda.
 *  - Consumo só existe em COMPLETED ou NO_SHOW (D2). Reverter não apaga: marca revertedAt.
 *  - Toda query filtra por organizationId do ator (src/lib/tenant.ts).
 */

type Tx = Prisma.TransactionClient;

const purchaseInclude = { consumptions: { select: { id: true, appointmentId: true, revertedAt: true, reason: true, consumedAt: true } }, payments: { select: { id: true, amountCents: true, paidAt: true, method: true } } } as const;

export type PurchaseView = Awaited<ReturnType<typeof listPurchasesForPatient>>[number];

/** Compras do paciente com saldo e status efetivo calculados (não depende do cron). */
export async function listPurchasesForPatient(actor: Actor, patientId: string, now = new Date()) {
  const rows = await db.packagePurchase.findMany({
    where: { organizationId: actor.organizationId, patientId },
    include: { ...purchaseInclude, professional: { select: { displayName: true } } },
    orderBy: [{ status: "asc" }, { purchasedAt: "desc" }],
  });
  return rows.map((p) => ({ ...p, balance: balance(p, p.consumptions), effective: effectiveStatus(p, p.consumptions, now), paidCents: p.payments.reduce((s, x) => s + x.amountCents, 0) }));
}

export async function getPurchaseInTenant(actor: Actor, purchaseId: string) {
  const p = await db.packagePurchase.findFirst({ where: { id: purchaseId, organizationId: actor.organizationId }, include: purchaseInclude });
  if (!p) throw new Error("Pacote não encontrado");
  return p;
}

/** Vende um pacote do catálogo ao paciente. Pagamento é registrado à parte (Payment.packagePurchaseId). */
export async function sellPackage(actor: Actor, input: { patientId: string; packageId: string; note?: string | null }) {
  const [pkg, patient, org] = await Promise.all([
    db.package.findFirst({ where: { id: input.packageId, organizationId: actor.organizationId, isActive: true } }),
    db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } }),
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
  ]);
  if (!pkg) throw new Error("Pacote não encontrado ou inativo");
  if (!patient) throw new Error("Paciente não encontrado");
  const purchasedAt = new Date();
  const purchase = await db.packagePurchase.create({
    data: {
      organizationId: actor.organizationId,
      patientId: patient.id,
      packageId: pkg.id,
      professionalId: pkg.professionalId,
      nameSnapshot: pkg.name,
      sessionsTotal: pkg.sessionsCount,
      priceCents: pkg.priceCents,
      serviceIds: pkg.serviceIds,
      purchasedAt,
      expiresAt: expiresAtFor(purchasedAt, pkg.validityDays, org.timezone),
      note: input.note ?? null,
    },
  });
  await audit(actor, { organizationId: actor.organizationId, action: "package_purchase.create", entityType: "PackagePurchase", entityId: purchase.id, after: { patientId: patient.id, packageId: pkg.id, sessions: pkg.sessionsCount, priceCents: pkg.priceCents, expiresAt: purchase.expiresAt } });
  return purchase;
}

export async function cancelPurchase(actor: Actor, purchaseId: string, reason: string) {
  const p = await getPurchaseInTenant(actor, purchaseId);
  if (p.status === "CANCELLED") return;
  await db.$transaction(async (tx) => {
    await tx.packagePurchase.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
    // Sessões futuras ainda vinculadas voltam a ser cobradas normalmente.
    await tx.appointment.updateMany({ where: { packagePurchaseId: p.id, packageConsumption: null }, data: { packagePurchaseId: null, paymentStatus: "PENDING" } });
  });
  await audit(actor, { organizationId: actor.organizationId, action: "package_purchase.cancel", entityType: "PackagePurchase", entityId: p.id, after: { reason } });
}

/** Compras ativas do paciente que cobrem esta sessão (para o botão "Usar pacote"). */
export async function candidatesForAppointment(actor: Actor, appointmentId: string, now = new Date()) {
  const a = await db.appointment.findFirst({ where: { id: appointmentId, organizationId: actor.organizationId }, select: { patientId: true, professionalId: true, serviceId: true, paymentStatus: true, packagePurchaseId: true } });
  if (!a || a.packagePurchaseId || a.paymentStatus === "PAID") return [];
  const rows = await db.packagePurchase.findMany({ where: { organizationId: actor.organizationId, patientId: a.patientId, status: "ACTIVE" }, include: { consumptions: { select: { revertedAt: true } } } });
  return rows.filter((p) => canLink(p, p.consumptions, a, now)).map((p) => ({ id: p.id, name: p.nameSnapshot, balance: balance(p, p.consumptions), expiresAt: p.expiresAt }));
}

/** Vincula a sessão a uma compra (não consome ainda). paymentStatus vira PACKAGE. */
export async function linkAppointment(actor: Actor, appointmentId: string, purchaseId: string, now = new Date()) {
  const [a, p] = await Promise.all([
    db.appointment.findFirst({ where: { id: appointmentId, organizationId: actor.organizationId }, select: { id: true, patientId: true, professionalId: true, serviceId: true, paymentStatus: true, status: true, packagePurchaseId: true } }),
    db.packagePurchase.findFirst({ where: { id: purchaseId, organizationId: actor.organizationId }, include: { consumptions: { select: { revertedAt: true } } } }),
  ]);
  if (!a || !p) throw new Error("Sessão ou pacote não encontrado");
  if (a.patientId !== p.patientId) throw new Error("O pacote é de outro paciente");
  if (a.paymentStatus === "PAID") throw new Error("Sessão já paga: desfaça o pagamento antes de usar o pacote");
  if (!canLink(p, p.consumptions, a, now)) throw new Error("Este pacote não cobre esta sessão (saldo, validade, profissional ou serviço)");
  await db.appointment.update({ where: { id: a.id }, data: { packagePurchaseId: p.id, paymentStatus: "PACKAGE", paymentMethod: null, paidAt: null } });
  await audit(actor, { organizationId: actor.organizationId, action: "appointment.package_link", entityType: "Appointment", entityId: a.id, after: { purchaseId: p.id } });
  // Sessão já concluída/faltou ao vincular: consome agora (caso "esqueci de vincular antes").
  await consumeIfDue(db, a.id);
}

export async function unlinkAppointment(actor: Actor, appointmentId: string) {
  const a = await db.appointment.findFirst({ where: { id: appointmentId, organizationId: actor.organizationId }, select: { id: true, packagePurchaseId: true, packageConsumption: { select: { id: true, revertedAt: true } } } });
  if (!a?.packagePurchaseId) return;
  if (a.packageConsumption && !a.packageConsumption.revertedAt) throw new Error("Esta sessão já consumiu o pacote. Reverta o consumo primeiro.");
  await db.appointment.update({ where: { id: a.id }, data: { packagePurchaseId: null, paymentStatus: "PENDING" } });
  await audit(actor, { organizationId: actor.organizationId, action: "appointment.package_unlink", entityType: "Appointment", entityId: a.id, before: { purchaseId: a.packagePurchaseId } });
}

/**
 * Se o paciente tem exatamente um pacote ativo que cobre a sessão, vincula automaticamente.
 * Chamado ao criar a sessão (manual e pública). Dois candidatos = decisão humana, não vincula.
 */
export async function autoLinkPackage(appointmentId: string, now = new Date()) {
  const a = await db.appointment.findUnique({ where: { id: appointmentId }, select: { organizationId: true, patientId: true, professionalId: true, serviceId: true, paymentStatus: true, packagePurchaseId: true } });
  if (!a || a.packagePurchaseId || a.paymentStatus !== "PENDING") return null;
  const rows = await db.packagePurchase.findMany({ where: { organizationId: a.organizationId, patientId: a.patientId, status: "ACTIVE" }, include: { consumptions: { select: { revertedAt: true } } } });
  const fit = rows.filter((p) => canLink(p, p.consumptions, a, now));
  if (fit.length !== 1) return null;
  await db.appointment.update({ where: { id: appointmentId }, data: { packagePurchaseId: fit[0].id, paymentStatus: "PACKAGE" } });
  return fit[0].id;
}

/**
 * Consome uma sessão do pacote se o status da sessão pede (D2). Idempotente: uma consumption por
 * appointmentId (unique). Chamado pelo transition() da agenda em complete/no_show e por linkAppointment.
 */
export async function consumeIfDue(client: Tx | typeof db, appointmentId: string, now = new Date()): Promise<ConsumeReason | null> {
  const a = await client.appointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, status: true, packagePurchaseId: true, packageConsumption: { select: { id: true, revertedAt: true } }, professional: { select: { policy: { select: { noShowConsumesPackage: true } } } } },
  });
  if (!a?.packagePurchaseId) return null;
  const reason = consumeReasonFor(a.status, { noShowConsumesPackage: a.professional.policy?.noShowConsumesPackage ?? true });
  if (!reason) return null;
  if (a.packageConsumption && !a.packageConsumption.revertedAt) return reason; // já consumido
  if (a.packageConsumption) {
    await client.packageConsumption.update({ where: { id: a.packageConsumption.id }, data: { revertedAt: null, revertReason: null, reason, consumedAt: now } });
  } else {
    await client.packageConsumption.create({ data: { packagePurchaseId: a.packagePurchaseId, appointmentId: a.id, reason, consumedAt: now } });
  }
  await refreshStatus(client, a.packagePurchaseId, now);
  return reason;
}

/** Reversão manual (erro de marcação, cortesia). Mantém a linha com o motivo. */
export async function revertConsumption(actor: Actor, appointmentId: string, reason: string) {
  const a = await db.appointment.findFirst({ where: { id: appointmentId, organizationId: actor.organizationId }, select: { id: true, packagePurchaseId: true, packageConsumption: { select: { id: true, revertedAt: true } } } });
  if (!a?.packageConsumption || a.packageConsumption.revertedAt) return;
  await db.$transaction(async (tx) => {
    await tx.packageConsumption.update({ where: { id: a.packageConsumption!.id }, data: { revertedAt: new Date(), revertReason: reason } });
    if (a.packagePurchaseId) await refreshStatus(tx, a.packagePurchaseId, new Date());
  });
  await audit(actor, { organizationId: actor.organizationId, action: "package_consumption.revert", entityType: "Appointment", entityId: a.id, after: { reason } });
}

/** Persiste o status efetivo (ACTIVE/EXHAUSTED/EXPIRED) — nunca mexe em CANCELLED. */
async function refreshStatus(client: Tx | typeof db, purchaseId: string, now: Date) {
  const p = await client.packagePurchase.findUnique({ where: { id: purchaseId }, include: { consumptions: { select: { revertedAt: true } } } });
  if (!p || p.status === "CANCELLED") return;
  const next = effectiveStatus(p, p.consumptions, now);
  if (next !== p.status) await client.packagePurchase.update({ where: { id: p.id }, data: { status: next } });
}

/** Cron: compras ativas com validade vencida viram EXPIRED. Sessões já agendadas ficam vinculadas (D2). */
export async function expirePurchases(now = new Date()) {
  const r = await db.packagePurchase.updateMany({ where: { status: "ACTIVE", expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  return r.count;
}
