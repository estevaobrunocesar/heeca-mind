/**
 * Regra de retenção — pura, testada em tests/retention.test.ts.
 *
 * O prazo conta a partir do evento mais recente entre a exclusão do cadastro
 * e o último atendimento: excluir um paciente hoje não encurta a guarda de
 * uma sessão de ontem, e um cadastro excluído há anos sem sessões não fica
 * preso a um "último atendimento" inexistente.
 */

export const MIN_RETENTION_YEARS = 5; // CFP Resolução 001/2009
export const MAX_RETENTION_YEARS = 20;

export function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

/** Quando o cadastro pode ser anonimizado. `null` se não estiver excluído. */
export function anonymizationDueAt(input: {
  deletedAt: Date | null;
  lastAppointmentAt: Date | null;
  retentionYears: number;
}): Date | null {
  if (!input.deletedAt) return null;
  const anchor =
    input.lastAppointmentAt && input.lastAppointmentAt > input.deletedAt ? input.lastAppointmentAt : input.deletedAt;
  return addYears(anchor, Math.max(MIN_RETENTION_YEARS, input.retentionYears));
}

export function isAnonymizationDue(input: Parameters<typeof anonymizationDueAt>[0], now: Date): boolean {
  const due = anonymizationDueAt(input);
  return due !== null && due <= now;
}
