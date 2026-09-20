"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { addAdjustment, closePeriod } from "@/lib/commissions/service";
import { validateRule } from "@/lib/commissions/rules";
import { formValues, invalid, type FormState } from "@/lib/form";
import { parseBRLToCents } from "@/lib/money";
import { audit } from "@/lib/audit";
import { canManageCommissions } from "@/lib/permissions";
import { requireActor } from "@/lib/session";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const money = (msg: string) =>
  z.string().trim().transform((v, ctx) => {
    const c = parseBRLToCents(v.replace(/^-/, ""));
    if (c === null) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return v.trim().startsWith("-") ? -c : c;
  });

async function manager() {
  const actor = await requireActor();
  if (!canManageCommissions(actor)) throw new Error("Sem permissão para comissões");
  return actor;
}

// ── Regras ──────────────────────────────────────────────────────────────────

const ruleSchema = z.object({
  professionalId: z.string().min(1),
  serviceId: z.string().transform((v) => (v === "" ? null : v)),
  mode: z.enum(["percent", "fixed"]),
  percent: z.string().trim(),
  fixed: z.string().trim(),
  validFrom: isoDate,
  validTo: z.string().transform((v) => (v === "" ? null : v)).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida"),
  note: z.string().trim().max(200).transform((v) => (v === "" ? null : v)),
});

export async function saveCommissionRuleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await manager();
  const parsed = ruleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  let percentBp: number | null = null, fixedCents: number | null = null;
  if (d.mode === "percent") {
    const n = Number(d.percent.replace(",", "."));
    if (!Number.isFinite(n)) return { fieldErrors: { percent: ["Percentual inválido"] }, values: formValues(formData) };
    percentBp = Math.round(n * 100);
  } else {
    const c = parseBRLToCents(d.fixed);
    if (c === null) return { fieldErrors: { fixed: ["Valor inválido"] }, values: formValues(formData) };
    fixedCents = c;
  }
  const validFrom = new Date(`${d.validFrom}T00:00:00Z`);
  const validTo = d.validTo ? new Date(`${d.validTo}T00:00:00Z`) : null;
  const err = validateRule({ percentBp, fixedCents, validFrom, validTo });
  if (err) return { error: err, values: formValues(formData) };
  const pro = await db.professional.findFirst({ where: { id: d.professionalId, organizationId: actor.organizationId }, select: { id: true } });
  if (!pro) return { error: "Profissional não encontrado" };
  if (d.serviceId) {
    const svc = await db.service.findFirst({ where: { id: d.serviceId, professionalId: pro.id }, select: { id: true } });
    if (!svc) return { error: "Serviço não pertence ao profissional" };
  }
  const rule = await db.commissionRule.create({ data: { organizationId: actor.organizationId, professionalId: pro.id, serviceId: d.serviceId, percentBp, fixedCents, validFrom, validTo, note: d.note, createdByUserId: actor.userId } });
  await audit(actor, { organizationId: actor.organizationId, action: "commission_rule.create", entityType: "CommissionRule", entityId: rule.id, after: rule });
  revalidatePath("/configuracoes/comissoes");
  return { ok: true };
}

/** Encerra a vigência (ontem). Regras não são apagadas: lançamentos passados apontam para elas. */
export async function endCommissionRuleAction(ruleId: string) {
  const actor = await manager();
  const r = await db.commissionRule.findFirst({ where: { id: ruleId, organizationId: actor.organizationId } });
  if (!r) throw new Error("Regra não encontrada");
  const today = new Date();
  const yesterday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1));
  const validTo = yesterday.getTime() < r.validFrom.getTime() ? r.validFrom : yesterday;
  await db.commissionRule.update({ where: { id: r.id }, data: { validTo } });
  await audit(actor, { organizationId: actor.organizationId, action: "commission_rule.end", entityType: "CommissionRule", entityId: r.id, after: { validTo } });
  revalidatePath("/configuracoes/comissoes");
}

// ── Fechamento e ajuste ─────────────────────────────────────────────────────

const closeSchema = z.object({ professionalId: z.string().min(1), periodStart: isoDate, periodEnd: isoDate, note: z.string().trim().max(200).transform((v) => (v === "" ? null : v)) });

export async function closePeriodAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await manager();
  const parsed = closeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  try {
    await closePeriod(actor, { professionalId: d.professionalId, periodStart: new Date(`${d.periodStart}T00:00:00Z`), periodEnd: new Date(`${d.periodEnd}T00:00:00Z`), note: d.note }, org.timezone);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível fechar.", values: formValues(formData) };
  }
  revalidatePath("/financeiro/comissoes");
  return { ok: true };
}

const adjustSchema = z.object({ professionalId: z.string().min(1), amount: money("Valor inválido. Use -50,00 para desconto."), note: z.string().trim().min(3, "Informe o motivo").max(200) });

export async function addAdjustmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await manager();
  const parsed = adjustSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  if (parsed.data.amount === 0) return { fieldErrors: { amount: ["Informe um valor diferente de zero"] }, values: formValues(formData) };
  await addAdjustment(actor, { professionalId: parsed.data.professionalId, amountCents: parsed.data.amount, note: parsed.data.note });
  revalidatePath("/financeiro/comissoes");
  return { ok: true };
}
