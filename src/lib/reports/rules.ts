/**
 * Indicadores administrativos (§26, §27) — regras puras, testadas em tests/report-rules.test.ts.
 * Definições explícitas (aparecem na UI como "como é calculado"):
 *
 *  - Ocupação = minutos com sessão ativa/concluída ÷ minutos da grade no período.
 *  - Ticket médio = recebido no período ÷ sessões concluídas cobradas no período.
 *  - Comparecimento = concluídas ÷ (concluídas + faltas).
 *  - Clientes: novo = cadastrado no período; ativo = em acompanhamento; recorrente = ≥ 3 sessões
 *    concluídas (ou série ativa); inativo = ativo no cadastro, mas sem sessão concluída há N dias.
 *  - Retenção = pacientes com ≥ 2 sessões concluídas ÷ pacientes com ≥ 1 (todo o histórico do escopo).
 */

import { addDaysCivil, weekdayOfCivilDate } from "@/lib/availability";
import { hhmmToMinutes } from "@/lib/time";

export type WeeklyRule = { weekday: number; startTime: string; endTime: string };

/** Minutos de grade entre duas datas civis (inclusive). Exceções e bloqueios não entram: é a capacidade nominal. */
export function workingMinutes(rules: WeeklyRule[], fromISO: string, toISO: string): number {
  const perWeekday = new Map<number, number>();
  for (const r of rules) perWeekday.set(r.weekday, (perWeekday.get(r.weekday) ?? 0) + Math.max(0, hhmmToMinutes(r.endTime) - hhmmToMinutes(r.startTime)));
  let total = 0;
  for (let d = fromISO; d <= toISO; d = addDaysCivil(d, 1)) total += perWeekday.get(weekdayOfCivilDate(d)) ?? 0;
  return total;
}

export function pct(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export function avgCents(totalCents: number, count: number): number | null {
  return count > 0 ? Math.round(totalCents / count) : null;
}

export type PatientStat = { createdAt: Date; followUpStatus: string; lastCompletedAt: Date | null; completedCount: number; hasActiveSeries: boolean; deletedAt: Date | null };

export function clientCohorts(patients: PatientStat[], range: { from: Date; to: Date }, now: Date, inactiveAfterDays = 90) {
  const live = patients.filter((p) => !p.deletedAt);
  const cutoff = new Date(now.getTime() - inactiveAfterDays * 86_400_000);
  const active = live.filter((p) => p.followUpStatus === "ACTIVE");
  return {
    new: live.filter((p) => p.createdAt >= range.from && p.createdAt < range.to).length,
    active: active.length,
    recurring: active.filter((p) => p.hasActiveSeries || p.completedCount >= 3).length,
    inactive: active.filter((p) => (p.lastCompletedAt ?? p.createdAt) < cutoff).length,
    retentionPct: pct(live.filter((p) => p.completedCount >= 2).length, live.filter((p) => p.completedCount >= 1).length),
  };
}

/** Soma por chave (profissional, serviço…), ordenada do maior para o menor. */
export function groupSum<T>(items: T[], key: (t: T) => string, value: (t: T) => number): Array<{ key: string; total: number; count: number }> {
  const m = new Map<string, { total: number; count: number }>();
  for (const it of items) {
    const k = key(it);
    const cur = m.get(k) ?? { total: 0, count: 0 };
    cur.total += value(it);
    cur.count += 1;
    m.set(k, cur);
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total);
}

export function surveySummary(scores: number[]): { avg: number | null; count: number; promoters: number; detractors: number } {
  if (scores.length === 0) return { avg: null, count: 0, promoters: 0, detractors: 0 };
  return {
    avg: Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10,
    count: scores.length,
    promoters: scores.filter((s) => s >= 9).length,
    detractors: scores.filter((s) => s <= 6).length,
  };
}

/** Candidatos à reativação (§28): ativos, sem sessão concluída há N dias, sem sessão futura, não contatados há N dias. */
export function reactivationCandidates<T extends { followUpStatus: string; lastCompletedAt: Date | null; createdAt: Date; hasFutureAppointment: boolean; lastContactAt: Date | null; deletedAt: Date | null }>(patients: T[], now: Date, afterDays: number): T[] {
  const cutoff = new Date(now.getTime() - afterDays * 86_400_000);
  return patients
    .filter((p) => !p.deletedAt && p.followUpStatus === "ACTIVE" && !p.hasFutureAppointment)
    .filter((p) => (p.lastCompletedAt ?? p.createdAt) < cutoff)
    .filter((p) => !p.lastContactAt || p.lastContactAt < cutoff)
    .sort((a, b) => (a.lastCompletedAt ?? a.createdAt).getTime() - (b.lastCompletedAt ?? b.createdAt).getTime());
}

export const DEFAULT_REACTIVATION_TEXT = "Faz um tempo desde a sua última sessão. Se quiser retomar, estou por aqui.";
