/**
 * Preferências de comunicação do paciente (§12 do briefing) — `Patient.commsPrefs`.
 * Puro, sem banco. Testado em tests/comms-prefs.test.ts.
 *
 * Só afeta mensagens NÃO essenciais (lembretes). Confirmação, cancelamento e reagendamento
 * são transacionais e continuam saindo; quem não quer nenhuma mensagem responde "PARAR"
 * (opt-out global, tratado pelo Notify).
 */

export type CommsPrefs = {
  /** Aceita lembretes por WhatsApp. false = nenhum lembrete automático. */
  whatsapp: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
};

export const DEFAULT_COMMS_PREFS: CommsPrefs = { whatsapp: true, reminder24h: true, reminder2h: true };

/** null/undefined/lixo → padrão (tudo ligado). Chaves desconhecidas são ignoradas. */
export function parseCommsPrefs(raw: unknown): CommsPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COMMS_PREFS };
  const r = raw as Record<string, unknown>;
  const b = (k: keyof CommsPrefs) => (typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_COMMS_PREFS[k]);
  return { whatsapp: b("whatsapp"), reminder24h: b("reminder24h"), reminder2h: b("reminder2h") };
}

/** Grava null quando tudo está no padrão — mantém a coluna vazia para a maioria. */
export function serializeCommsPrefs(p: CommsPrefs): CommsPrefs | null {
  return p.whatsapp === true && p.reminder24h === true && p.reminder2h === true ? null : p;
}

/** Lembrete de determinado tipo pode ser enviado a este paciente? */
export function reminderAllowed(prefs: CommsPrefs, type: "REMINDER_24H" | "REMINDER_2H" | "SESSION_LINK"): boolean {
  if (!prefs.whatsapp) return type === "SESSION_LINK"; // o link da sala é operacional, não lembrete
  if (type === "REMINDER_24H") return prefs.reminder24h;
  if (type === "REMINDER_2H") return prefs.reminder2h;
  return true;
}

export function describeCommsPrefs(p: CommsPrefs): string {
  if (!p.whatsapp) return "Sem lembretes por WhatsApp";
  const parts = [p.reminder24h && "24 h antes", p.reminder2h && "2 h antes"].filter(Boolean);
  return parts.length ? `Lembretes: ${parts.join(" e ")}` : "Sem lembretes";
}
