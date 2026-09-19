/**
 * Lista de espera — regras puras (sem banco).
 *
 * Uma entrada guarda preferências frouxas (modalidade, dias da semana,
 * períodos do dia). Quando um horário vaga, `matchesSlot` diz se a entrada
 * combina; `sortWaitlist` define a ordem de oferta: prioritários primeiro,
 * depois quem espera há mais tempo.
 */

export type DayPeriod = "MORNING" | "AFTERNOON" | "EVENING";

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  MORNING: "Manhã (até 12h)",
  AFTERNOON: "Tarde (12h–18h)",
  EVENING: "Noite (após 18h)",
};

export const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

export function periodOfHour(hour: number): DayPeriod {
  if (hour < 12) return "MORNING";
  if (hour < 18) return "AFTERNOON";
  return "EVENING";
}

export type WaitlistPrefs = {
  /** null = qualquer modalidade */
  modality: "IN_PERSON" | "ONLINE" | null;
  /** 0 (dom) … 6 (sáb); vazio = qualquer dia */
  weekdays: number[];
  /** vazio = qualquer período */
  periods: DayPeriod[];
};

export type SlotFacts = {
  modality: "IN_PERSON" | "ONLINE";
  /** dia da semana e hora já no fuso da organização */
  weekday: number;
  hour: number;
};

/** Preferência vazia = "tanto faz". Cada dimensão só restringe se foi informada. */
export function matchesSlot(prefs: WaitlistPrefs, slot: SlotFacts): boolean {
  if (prefs.modality && prefs.modality !== slot.modality) return false;
  if (prefs.weekdays.length > 0 && !prefs.weekdays.includes(slot.weekday)) return false;
  if (prefs.periods.length > 0 && !prefs.periods.includes(periodOfHour(slot.hour))) return false;
  return true;
}

export type Sortable = { priority: boolean; createdAt: Date };

/** Prioritários primeiro; dentro de cada grupo, quem entrou antes. Estável. */
export function sortWaitlist<T extends Sortable>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Texto curto das preferências para listas e mensagens internas. */
export function describePrefs(prefs: WaitlistPrefs): string {
  const parts: string[] = [];
  parts.push(prefs.modality === "ONLINE" ? "online" : prefs.modality === "IN_PERSON" ? "presencial" : "qualquer modalidade");
  parts.push(prefs.weekdays.length ? [...prefs.weekdays].sort().map((d) => WEEKDAY_LABEL[d]).join("/") : "qualquer dia");
  parts.push(prefs.periods.length ? prefs.periods.map((p) => PERIOD_LABEL[p].split(" ")[0].toLowerCase()).join("/") : "qualquer período");
  return parts.join(" · ");
}

/** Normaliza entradas de formulário (strings soltas) para os tipos acima. */
export function parsePrefs(input: { modality?: string | null; weekdays?: string[] | string | null; periods?: string[] | string | null }): WaitlistPrefs {
  const arr = (v: string[] | string | null | undefined) => (v == null ? [] : Array.isArray(v) ? v : [v]);
  const weekdays = [...new Set(arr(input.weekdays).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  const periods = [...new Set(arr(input.periods).filter((p): p is DayPeriod => p === "MORNING" || p === "AFTERNOON" || p === "EVENING"))];
  const modality = input.modality === "ONLINE" || input.modality === "IN_PERSON" ? input.modality : null;
  return { modality, weekdays, periods };
}
