/**
 * Cálculo de disponibilidade — o coração do agendamento.
 *
 * Função pura: recebe tudo que precisa (grade, exceções, bloqueios, sessões,
 * regras) e devolve os instantes UTC em que uma nova sessão pode começar.
 * Nada aqui toca o banco; quem chama carrega os dados (ver
 * src/lib/availability-data.ts) e passa por aqui.
 *
 * Pipeline para uma data civil D no fuso da organização:
 *   1. janelas abertas  = grade[weekday(D)] ∪ exceções[D]      (mescladas)
 *   2. candidatos       = inícios a cada `slotStepMinutes` que cabem na janela
 *   3. candidatos      −= os que colidem com bloqueios
 *   4. candidatos      −= os que colidem com sessões ± buffer
 *      (bloqueios não recortam a janela: assim os candidatos seguem
 *       alinhados à grade — 09:00, 09:30 — mesmo com bloqueio às 10:15)
 *   5. candidatos      −= os antes de now + antecedência mínima
 *   6. vazio se D fora da janela de agendamento ou dia já lotado
 */

import { dateTimeInTz, slotLabelInTz, toLocalFields } from "./time";

export type Interval = { start: Date; end: Date };

export type AvailabilityInput = {
  tz: string;
  /** Grade semanal. weekday 0=dom…6=sáb; horários "HH:mm" no fuso. */
  rules: ReadonlyArray<{ weekday: number; startTime: string; endTime: string }>;
  /** Horários excepcionais por data civil "YYYY-MM-DD". Somam-se à grade. */
  exceptions: ReadonlyArray<{ date: string; startTime: string; endTime: string }>;
  /** Períodos indisponíveis (UTC). */
  blocks: ReadonlyArray<Interval>;
  /** Sessões ativas (UTC). Já filtradas por status — canceladas não entram. */
  appointments: ReadonlyArray<Interval>;
  settings: {
    bufferMinutes: number;
    slotStepMinutes: number;
    minAdvanceHours: number;
    maxBookingDaysAhead: number;
    maxSessionsPerDay: number | null;
  };
  /** Duração da sessão que se quer encaixar. */
  durationMinutes: number;
  /** Instante de referência ("agora"). Injetado para testes. */
  now: Date;
};

const MIN = 60_000;

/** Dia da semana de uma data civil, sem fuso: "2026-09-22" -> 2 (terça). */
export function weekdayOfCivilDate(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

/** Soma dias a uma data civil. */
export function addDaysCivil(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Mescla intervalos sobrepostos ou encostados. Retorna ordenado. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const cur of sorted) {
    const last = out[out.length - 1];
    if (last && cur.start <= last.end) {
      if (cur.end > last.end) last.end = cur.end;
    } else {
      out.push({ start: cur.start, end: cur.end });
    }
  }
  return out;
}

/** Remove de `windows` tudo que intersecta `holes`. */
export function subtractIntervals(windows: Interval[], holes: Interval[]): Interval[] {
  let result = windows;
  for (const h of holes) {
    const next: Interval[] = [];
    for (const w of result) {
      if (h.end <= w.start || h.start >= w.end) {
        next.push(w); // sem interseção
        continue;
      }
      if (h.start > w.start) next.push({ start: w.start, end: h.start });
      if (h.end < w.end) next.push({ start: h.end, end: w.end });
    }
    result = next;
  }
  return result;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Janelas de atendimento (UTC) para uma data civil, já mescladas. */
export function openWindowsForDate(input: AvailabilityInput, dateISO: string): Interval[] {
  const weekday = weekdayOfCivilDate(dateISO);
  const raw: Interval[] = [];
  for (const r of input.rules) {
    if (r.weekday !== weekday) continue;
    raw.push({ start: dateTimeInTz(dateISO, r.startTime, input.tz), end: dateTimeInTz(dateISO, r.endTime, input.tz) });
  }
  for (const e of input.exceptions) {
    if (e.date !== dateISO) continue;
    raw.push({ start: dateTimeInTz(dateISO, e.startTime, input.tz), end: dateTimeInTz(dateISO, e.endTime, input.tz) });
  }
  return mergeIntervals(raw);
}

/** Data civil de hoje no fuso. */
export function todayCivil(now: Date, tz: string): string {
  return toLocalFields(now, tz).date;
}

function isWithinBookingWindow(input: AvailabilityInput, dateISO: string): boolean {
  const today = todayCivil(input.now, input.tz);
  if (dateISO < today) return false;
  const last = addDaysCivil(today, input.settings.maxBookingDaysAhead);
  return dateISO <= last;
}

/** Sessões que começam na data civil D (no fuso). */
function appointmentsOnDate(input: AvailabilityInput, dateISO: string): Interval[] {
  return input.appointments.filter((a) => toLocalFields(a.start, input.tz).date === dateISO);
}

/**
 * Inícios possíveis (UTC) para uma sessão de `durationMinutes` na data civil.
 * Ordenados. Vazio se o dia não atende, está lotado ou fora da janela.
 */
export function computeAvailableSlots(input: AvailabilityInput, dateISO: string): Date[] {
  if (!isWithinBookingWindow(input, dateISO)) return [];

  const { bufferMinutes, slotStepMinutes, minAdvanceHours, maxSessionsPerDay } = input.settings;

  if (maxSessionsPerDay !== null && appointmentsOnDate(input, dateISO).length >= maxSessionsPerDay) {
    return [];
  }

  const windows = openWindowsForDate(input, dateISO);
  if (windows.length === 0) return [];

  const earliest = new Date(input.now.getTime() + minAdvanceHours * 60 * MIN);
  const durationMs = input.durationMinutes * MIN;
  const stepMs = slotStepMinutes * MIN;
  const bufferMs = bufferMinutes * MIN;

  // Sessões "infladas" pelo buffer: um candidato não pode encostar nelas.
  const busy: Interval[] = [
    ...input.appointments.map((a) => ({
      start: new Date(a.start.getTime() - bufferMs),
      end: new Date(a.end.getTime() + bufferMs),
    })),
    ...input.blocks,
  ];

  const slots: Date[] = [];
  for (const w of windows) {
    // Alinha os candidatos ao passo dentro da janela (09:00, 09:30, …).
    for (let t = w.start.getTime(); t + durationMs <= w.end.getTime(); t += stepMs) {
      const candidate = { start: new Date(t), end: new Date(t + durationMs) };
      if (candidate.start < earliest) continue;
      if (busy.some((b) => overlaps(candidate, b))) continue;
      slots.push(candidate.start);
    }
  }
  return slots;
}

/**
 * Resumo por dia para o calendário público: quais datas têm ao menos um
 * horário. Custo: O(dias × slots) — aceitável para a janela típica de 60 dias.
 */
export function computeAvailableDays(input: AvailabilityInput, fromISO: string, toISO: string): string[] {
  const days: string[] = [];
  for (let d = fromISO; d <= toISO; d = addDaysCivil(d, 1)) {
    if (computeAvailableSlots(input, d).length > 0) days.push(d);
  }
  return days;
}

/**
 * Verificação de um horário específico — usada ao confirmar um agendamento
 * público, para garantir que o slot escolhido ainda está livre.
 */
export function isSlotAvailable(input: AvailabilityInput, start: Date): boolean {
  const dateISO = toLocalFields(start, input.tz).date;
  return computeAvailableSlots(input, dateISO).some((s) => s.getTime() === start.getTime());
}

/**
 * Conflitos "duros" para agendamento MANUAL pelo profissional: ele pode
 * marcar fora da grade (um encaixe às 8h), mas nunca sobre outra sessão ou
 * sobre um bloqueio. Buffer não se aplica — é decisão dele.
 */
export function findHardConflicts(
  candidate: Interval,
  appointments: ReadonlyArray<Interval & { id?: string }>,
  blocks: ReadonlyArray<Interval>,
): { appointments: Array<Interval & { id?: string }>; blocks: Interval[] } {
  return {
    appointments: appointments.filter((a) => overlaps(candidate, a)),
    blocks: blocks.filter((b) => overlaps(candidate, b)),
  };
}

/** Utilidade para exibir: horário "HH:mm" de um instante no fuso. */
export function slotLabel(slot: Date, tz: string): string {
  return slotLabelInTz(slot, tz);
}
