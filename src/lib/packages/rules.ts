/**
 * Pacotes de sessões (§20 do briefing; decisões D1/D2 em docs/mind/06-GAPS-E-PLANO.md).
 * Regras puras — sem banco. Testadas em tests/package-rules.test.ts.
 *
 *  - Saldo é sempre CALCULADO: total − consumos não revertidos. Nunca coluna.
 *  - Consumo acontece em COMPLETED sempre e em NO_SHOW conforme a política do profissional.
 *  - Validade é data civil no fuso da organização: comprado dia 1 com 90 dias vale até o fim do dia 91.
 */

export type PurchaseLike = {
  sessionsTotal: number;
  expiresAt: Date;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "CANCELLED";
  professionalId: string;
  serviceIds: string[];
};

export type ConsumptionLike = { revertedAt: Date | null };

export function balance(p: Pick<PurchaseLike, "sessionsTotal">, consumptions: ConsumptionLike[]): number {
  const used = consumptions.filter((c) => c.revertedAt === null).length;
  return Math.max(0, p.sessionsTotal - used);
}

export function isExpired(p: Pick<PurchaseLike, "expiresAt">, now: Date): boolean {
  return p.expiresAt.getTime() < now.getTime();
}

/**
 * Status que a compra DEVERIA ter agora, dado saldo e validade. O serviço persiste isso ao
 * consumir/reverter e no cron de expiração; a leitura pode recalcular para não depender do cron.
 */
export function effectiveStatus(p: PurchaseLike, consumptions: ConsumptionLike[], now: Date): PurchaseLike["status"] {
  if (p.status === "CANCELLED") return "CANCELLED";
  if (balance(p, consumptions) === 0) return "EXHAUSTED";
  if (isExpired(p, now)) return "EXPIRED";
  return "ACTIVE";
}

/** O pacote cobre esta sessão? Mesmo profissional e serviço dentro da cobertura (vazio = qualquer). */
export function covers(p: Pick<PurchaseLike, "professionalId" | "serviceIds">, appt: { professionalId: string; serviceId: string }): boolean {
  if (p.professionalId !== appt.professionalId) return false;
  return p.serviceIds.length === 0 || p.serviceIds.includes(appt.serviceId);
}

/** Pode vincular uma sessão nova a esta compra agora? */
export function canLink(p: PurchaseLike, consumptions: ConsumptionLike[], appt: { professionalId: string; serviceId: string }, now: Date): boolean {
  return effectiveStatus(p, consumptions, now) === "ACTIVE" && covers(p, appt);
}

export type ConsumeReason = "completed" | "no_show";

/** D2: concluída consome sempre; falta consome se a política do profissional mandar. */
export function consumeReasonFor(status: string, policy: { noShowConsumesPackage: boolean }): ConsumeReason | null {
  if (status === "COMPLETED") return "completed";
  if (status === "NO_SHOW") return policy.noShowConsumesPackage ? "no_show" : null;
  return null;
}

/** Fim do dia civil de (purchasedAt + validityDays) no fuso dado, como instante UTC. */
export function expiresAtFor(purchasedAt: Date, validityDays: number, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(purchasedAt);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Data civil da compra + validade, em UTC "puro"; depois convertida para 23:59:59 local.
  const civil = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + validityDays));
  const y = civil.getUTCFullYear(), m = civil.getUTCMonth(), d = civil.getUTCDate();
  // Offset do fuso naquela data: diferença entre o mesmo instante lido em UTC e no fuso.
  const probe = new Date(Date.UTC(y, m, d, 23, 59, 59));
  const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(probe);
  const lg = (t: string) => Number(local.find((p) => p.type === t)?.value.replace("24", "00"));
  const asIfUtc = Date.UTC(lg("year"), lg("month") - 1, lg("day"), lg("hour"), lg("minute"), lg("second"));
  const offsetMs = asIfUtc - probe.getTime();
  return new Date(probe.getTime() - offsetMs);
}

export const PURCHASE_STATUS_LABEL: Record<PurchaseLike["status"], string> = {
  ACTIVE: "Ativo",
  EXHAUSTED: "Esgotado",
  EXPIRED: "Vencido",
  CANCELLED: "Cancelado",
};

/** "5 contratadas · 2 usadas · 3 disponíveis" (§20). */
export function describeBalance(p: Pick<PurchaseLike, "sessionsTotal">, consumptions: ConsumptionLike[]): string {
  const left = balance(p, consumptions);
  const used = p.sessionsTotal - left;
  return `${p.sessionsTotal} contratada${p.sessionsTotal === 1 ? "" : "s"} · ${used} usada${used === 1 ? "" : "s"} · ${left} disponív${left === 1 ? "el" : "eis"}`;
}
