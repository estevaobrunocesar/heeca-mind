/**
 * Comissões (§25; D3: base = valor RECEBIDO). Regras puras — testadas em tests/commission-rules.test.ts.
 *
 *  - O lançamento nasce no evento do pagamento (sessão ou pacote) e nunca é editado.
 *  - Regra com serviço prevalece sobre a geral; entre iguais, a de validFrom mais recente.
 *  - Percentual em basis points (1250 = 12,5 %), arredondado para baixo em centavos; ou fixo por pagamento.
 *  - Fechamento é imutável: estorno de pagamento já fechado vira linha NEGATIVA no período aberto.
 */

export type RuleLike = { id: string; serviceId: string | null; percentBp: number | null; fixedCents: number | null; validFrom: Date; validTo: Date | null };

/** Data civil (UTC 00:00, como @db.Date) de um instante no fuso dado. */
export function civilDate(at: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}

function inForce(r: RuleLike, day: Date): boolean {
  return r.validFrom.getTime() <= day.getTime() && (r.validTo === null || r.validTo.getTime() >= day.getTime());
}

/** Regra aplicável a um pagamento: específica do serviço > geral; mais recente vence. null = sem comissão. */
export function pickRule(rules: RuleLike[], serviceId: string | null, day: Date): RuleLike | null {
  const valid = rules.filter((r) => inForce(r, day));
  const byRecent = (a: RuleLike, b: RuleLike) => b.validFrom.getTime() - a.validFrom.getTime();
  const specific = serviceId ? valid.filter((r) => r.serviceId === serviceId).sort(byRecent) : [];
  if (specific.length) return specific[0];
  const general = valid.filter((r) => r.serviceId === null).sort(byRecent);
  return general[0] ?? null;
}

/** Valor da comissão sobre uma base em centavos. Percentual arredonda para baixo. */
export function computeAmount(rule: Pick<RuleLike, "percentBp" | "fixedCents">, baseCents: number): number {
  if (rule.percentBp !== null && rule.percentBp !== undefined) return Math.floor((baseCents * rule.percentBp) / 10_000);
  return rule.fixedCents ?? 0;
}

/**
 * Pagamento de pacote: a comissão incide sobre o valor recebido, com a regra geral (o pacote pode
 * cobrir vários serviços). Percentual funciona direto; valor fixo é por SESSÃO — multiplica pelo
 * número de sessões proporcional ao que foi pago.
 */
export function packagePaymentAmount(rule: Pick<RuleLike, "percentBp" | "fixedCents">, paidCents: number, pkg: { priceCents: number; sessionsTotal: number }): number {
  if (rule.percentBp !== null && rule.percentBp !== undefined) return computeAmount(rule, paidCents);
  if (!rule.fixedCents || pkg.priceCents <= 0) return 0;
  const sessionsPaid = (paidCents / pkg.priceCents) * pkg.sessionsTotal;
  return Math.floor(rule.fixedCents * sessionsPaid);
}

export function describeRule(r: Pick<RuleLike, "percentBp" | "fixedCents">): string {
  if (r.percentBp !== null && r.percentBp !== undefined) return `${(r.percentBp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do recebido`;
  return `${((r.fixedCents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por sessão`;
}

export type EntryLike = { amountCents: number; closingId: string | null; occurredAt: Date };

/** Total em aberto (não fechado) até uma data — o que o fechamento vai consolidar. */
export function openTotal(entries: EntryLike[], until: Date): { total: number; count: number } {
  const open = entries.filter((e) => e.closingId === null && e.occurredAt.getTime() <= until.getTime());
  return { total: open.reduce((s, e) => s + e.amountCents, 0), count: open.length };
}

/** Validação da regra: exatamente um de percentual/fixo; percentual 0–100 %; validade coerente. */
export function validateRule(r: { percentBp: number | null; fixedCents: number | null; validFrom: Date; validTo: Date | null }): string | null {
  const hasPct = r.percentBp !== null, hasFix = r.fixedCents !== null;
  if (hasPct === hasFix) return "Informe percentual OU valor fixo (só um)";
  if (hasPct && (r.percentBp! < 0 || r.percentBp! > 10_000)) return "Percentual entre 0 e 100";
  if (hasFix && r.fixedCents! < 0) return "Valor fixo não pode ser negativo";
  if (r.validTo && r.validTo.getTime() < r.validFrom.getTime()) return "O fim da validade precisa ser depois do início";
  return null;
}
