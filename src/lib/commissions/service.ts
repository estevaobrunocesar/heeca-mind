import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/permissions";
import { dateTimeInTz } from "@/lib/time";
import { civilDate, computeAmount, openTotal, packagePaymentAmount, pickRule } from "./rules";

/**
 * Comissões — parte com banco (docs/mind/03-FLUXOS.md F10). Regras puras em ./rules.ts.
 * Gancho único: `onPaymentRecorded(paymentId)` após criar um Payment; `onPaymentsReverted(ids)` ao
 * desfazer. Idempotente por paymentId. Nunca lança para o fluxo de pagamento: uma comissão que falha
 * não pode impedir o recebimento de ser registrado.
 */

type Client = Prisma.TransactionClient | typeof db;

export async function onPaymentRecorded(paymentId: string, client: Client = db): Promise<void> {
  try {
    const p = await client.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true, amountCents: true, paidAt: true,
        appointment: { select: { id: true, organizationId: true, professionalId: true, serviceId: true } },
        packagePurchase: { select: { id: true, organizationId: true, professionalId: true, priceCents: true, sessionsTotal: true } },
      },
    });
    if (!p) return;
    const ctx = p.appointment ?? p.packagePurchase;
    if (!ctx) return;
    const exists = await client.commissionEntry.findFirst({ where: { paymentId: p.id, kind: "PAYMENT" }, select: { id: true } });
    if (exists) return;
    const [rules, org] = await Promise.all([
      client.commissionRule.findMany({ where: { organizationId: ctx.organizationId, professionalId: ctx.professionalId } }),
      client.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { timezone: true } }),
    ]);
    if (rules.length === 0) return;
    const day = civilDate(p.paidAt, org.timezone);
    const rule = pickRule(rules, p.appointment?.serviceId ?? null, day);
    if (!rule) return;
    const amount = p.packagePurchase ? packagePaymentAmount(rule, p.amountCents, p.packagePurchase) : computeAmount(rule, p.amountCents);
    await client.commissionEntry.create({
      data: {
        organizationId: ctx.organizationId,
        professionalId: ctx.professionalId,
        kind: "PAYMENT",
        paymentId: p.id,
        appointmentId: p.appointment?.id ?? null,
        packagePurchaseId: p.packagePurchase?.id ?? null,
        ruleId: rule.id,
        baseCents: p.amountCents,
        amountCents: amount,
        occurredAt: p.paidAt,
      },
    });
  } catch (e) {
    console.error("[commissions] falha ao lançar comissão do pagamento", paymentId, e);
  }
}

/** Pagamentos desfeitos: apaga lançamentos abertos; os já fechados ganham estorno negativo no período aberto. */
export async function onPaymentsReverted(payments: { id: string }[], actor: Actor | null, client: Client = db): Promise<void> {
  try {
    const ids = payments.map((p) => p.id);
    if (ids.length === 0) return;
    const entries = await client.commissionEntry.findMany({ where: { paymentId: { in: ids }, kind: "PAYMENT" } });
    const open = entries.filter((e) => e.closingId === null);
    const closed = entries.filter((e) => e.closingId !== null);
    if (open.length) await client.commissionEntry.deleteMany({ where: { id: { in: open.map((e) => e.id) } } });
    for (const e of closed) {
      const already = await client.commissionEntry.findFirst({ where: { paymentId: e.paymentId, kind: "REVERSAL" }, select: { id: true } });
      if (already) continue;
      await client.commissionEntry.create({
        data: { organizationId: e.organizationId, professionalId: e.professionalId, kind: "REVERSAL", paymentId: e.paymentId, appointmentId: e.appointmentId, packagePurchaseId: e.packagePurchaseId, ruleId: e.ruleId, baseCents: -e.baseCents, amountCents: -e.amountCents, occurredAt: new Date(), note: "Estorno de pagamento já fechado", createdByUserId: actor?.userId ?? null },
      });
    }
  } catch (e) {
    console.error("[commissions] falha ao estornar comissão", e);
  }
}

export async function addAdjustment(actor: Actor, input: { professionalId: string; amountCents: number; note: string; occurredAt?: Date }) {
  const pro = await db.professional.findFirst({ where: { id: input.professionalId, organizationId: actor.organizationId }, select: { id: true } });
  if (!pro) throw new Error("Profissional não encontrado");
  const e = await db.commissionEntry.create({
    data: { organizationId: actor.organizationId, professionalId: pro.id, kind: "ADJUSTMENT", baseCents: 0, amountCents: input.amountCents, occurredAt: input.occurredAt ?? new Date(), note: input.note, createdByUserId: actor.userId },
  });
  await audit(actor, { organizationId: actor.organizationId, action: "commission.adjust", entityType: "CommissionEntry", entityId: e.id, after: { professionalId: pro.id, amountCents: input.amountCents, note: input.note } });
  return e;
}

/**
 * Fecha tudo que está aberto até o fim do período (data civil). Imutável: os lançamentos ganham
 * closingId; o que entrar depois cai no próximo fechamento.
 */
export async function closePeriod(actor: Actor, input: { professionalId: string; periodStart: Date; periodEnd: Date; note?: string | null }, tz: string) {
  const pro = await db.professional.findFirst({ where: { id: input.professionalId, organizationId: actor.organizationId }, select: { id: true } });
  if (!pro) throw new Error("Profissional não encontrado");
  // Fim do período = 23:59 do dia civil no fuso da organização (+1 min = limite exclusivo).
  const untilExclusive = new Date(dateTimeInTz(input.periodEnd.toISOString().slice(0, 10), "23:59", tz).getTime() + 60_000);
  const entries = await db.commissionEntry.findMany({ where: { organizationId: actor.organizationId, professionalId: pro.id, closingId: null, occurredAt: { lt: untilExclusive } }, select: { id: true, amountCents: true, closingId: true, occurredAt: true } });
  const { total, count } = openTotal(entries, untilExclusive);
  if (count === 0) throw new Error("Nada em aberto para fechar neste período");
  const closing = await db.$transaction(async (tx) => {
    const c = await tx.commissionClosing.create({ data: { organizationId: actor.organizationId, professionalId: pro.id, periodStart: input.periodStart, periodEnd: input.periodEnd, totalCents: total, entriesCount: count, closedByUserId: actor.userId, note: input.note ?? null } });
    await tx.commissionEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { closingId: c.id } });
    return c;
  });
  await audit(actor, { organizationId: actor.organizationId, action: "commission.close", entityType: "CommissionClosing", entityId: closing.id, after: { professionalId: pro.id, periodStart: input.periodStart, periodEnd: input.periodEnd, totalCents: total, count } });
  return closing;
}

export async function statement(actor: Actor, professionalId: string, range: { from: Date; to: Date }) {
  const [entries, closings, rules] = await Promise.all([
    db.commissionEntry.findMany({
      where: { organizationId: actor.organizationId, professionalId, occurredAt: { gte: range.from, lt: range.to } },
      orderBy: { occurredAt: "asc" },
      include: { closing: { select: { id: true, periodEnd: true } } },
    }),
    db.commissionClosing.findMany({ where: { organizationId: actor.organizationId, professionalId }, orderBy: { periodEnd: "desc" }, take: 12 }),
    db.commissionRule.findMany({ where: { organizationId: actor.organizationId, professionalId }, orderBy: [{ validFrom: "desc" }] }),
  ]);
  const openAll = await db.commissionEntry.aggregate({ where: { organizationId: actor.organizationId, professionalId, closingId: null }, _sum: { amountCents: true }, _count: true });
  return { entries, closings, rules, openTotalCents: openAll._sum.amountCents ?? 0, openCount: openAll._count };
}
