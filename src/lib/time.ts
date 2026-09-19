/**
 * Utilitários de data/hora com fuso explícito.
 *
 * Regra do projeto: o banco guarda UTC; a organização tem um `timezone` IANA
 * (default America/Sao_Paulo). Toda conversão passa por aqui — nunca use
 * `new Date("2026-09-22T15:00")` diretamente, pois isso interpreta no fuso
 * do servidor, que em produção costuma ser UTC.
 *
 * Sem dependências: usa Intl para descobrir o offset do fuso no instante.
 */

export const DEFAULT_TZ = "America/Sao_Paulo";

export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isHHmm(s: string): boolean {
  return HHMM.test(s);
}

/** "14:30" -> 870 (minutos desde 00:00). Lança se inválido. */
export function hhmmToMinutes(s: string): number {
  const m = HHMM.exec(s);
  if (!m) throw new Error(`Horário inválido: ${s}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 870 -> "14:30" */
export function minutesToHHmm(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Decompõe um instante UTC nos campos de calendário do fuso dado. */
export function partsInTz(date: Date, tz: string): Parts {
  const p: Record<string, string> = {};
  for (const { type, value } of dtf(tz).formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: WEEKDAY_INDEX[p.weekday] ?? 0,
  };
}

/** Offset (ms) do fuso em relação ao UTC naquele instante. SP = -3h. */
function tzOffsetMs(date: Date, tz: string): number {
  const p = partsInTz(date, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - date.getTime();
}

/**
 * Constrói um instante UTC a partir de data/hora "de parede" no fuso.
 * zonedToUtc(2026, 9, 22, 15, 0, "America/Sao_Paulo") -> 2026-09-22T18:00:00Z
 */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Dois passos cobrem transições de horário de verão.
  const offset1 = tzOffsetMs(new Date(guess), tz);
  const offset2 = tzOffsetMs(new Date(guess - offset1), tz);
  return new Date(guess - offset2);
}

/** "2026-09-22" + "15:00" no fuso -> Date UTC. */
export function dateTimeInTz(dateISO: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return zonedToUtc(y, m, d, hh, mm, tz);
}

/** Date UTC -> { date: "2026-09-22", time: "15:00" } no fuso. */
export function toLocalFields(date: Date, tz: string): { date: string; time: string } {
  const p = partsInTz(date, tz);
  return {
    date: `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`,
    time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
  };
}

export function formatDateTimeBR(date: Date, tz: string): string {
  return date.toLocaleString("pt-BR", { timeZone: tz, dateStyle: "short", timeStyle: "short" });
}

export function formatDateBR(date: Date, tz: string): string {
  return date.toLocaleDateString("pt-BR", { timeZone: tz, dateStyle: "short" });
}

/** "HH:mm" de um instante no fuso. */
export function slotLabelInTz(date: Date, tz: string): string {
  const p = partsInTz(date, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Data civil e mês ("YYYY-MM") de um instante no fuso. */
export function todayCivilAndMonth(now: Date, tz: string): { date: string; month: string } {
  const { date } = toLocalFields(now, tz);
  return { date, month: date.slice(0, 7) };
}
