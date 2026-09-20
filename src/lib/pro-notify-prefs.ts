/**
 * Avisos por e-mail ao profissional — preferências (puro, testado).
 *
 * Cada evento pode ser ligado/desligado; há um interruptor geral. Padrão:
 * tudo ligado. Guardado em User.emailNotifications (Json); ausente = padrão.
 */

export const PRO_EVENTS = [
  "BOOKING_REQUESTED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "RESCHEDULE_REQUESTED",
  "FORM_SUBMITTED",
  "WAITLIST_JOINED",
  "WAITLIST_OFFER_ANSWERED",
  "DELEGATION_RECEIVED",
  "DOCUMENT_ACCEPTED",
] as const;
export type ProEvent = (typeof PRO_EVENTS)[number];

export const PRO_EVENT_LABEL: Record<ProEvent, { title: string; hint: string }> = {
  BOOKING_REQUESTED: { title: "Novo pedido de horário", hint: "Alguém solicitou uma sessão pela página pública." },
  BOOKING_CONFIRMED: { title: "Paciente confirmou", hint: "Confirmação pelo link ou pelo WhatsApp." },
  BOOKING_CANCELLED: { title: "Paciente cancelou", hint: "Cancelamento pelo link ou pelo WhatsApp." },
  RESCHEDULE_REQUESTED: { title: "Pedido de reagendamento", hint: "Paciente respondeu 'não' fora do prazo de cancelamento." },
  FORM_SUBMITTED: { title: "Formulário respondido", hint: "Ficha, termo ou questionário preenchido. O e-mail não traz as respostas." },
  WAITLIST_JOINED: { title: "Entrada na lista de espera", hint: "Alguém entrou pela página pública." },
  WAITLIST_OFFER_ANSWERED: { title: "Resposta a oferta de horário", hint: "Aceitou ou recusou um horário da lista de espera." },
  DELEGATION_RECEIVED: { title: "Delegação recebida", hint: "Um colega delegou um prontuário a você (supervisão/substituição)." },
  DOCUMENT_ACCEPTED: { title: "Documento aceito", hint: "Paciente leu e aceitou um termo, contrato ou política." },
};

export type ProNotifyPrefs = { enabled: boolean; events: Record<ProEvent, boolean> };

export function defaultPrefs(): ProNotifyPrefs {
  return { enabled: true, events: Object.fromEntries(PRO_EVENTS.map((e) => [e, true])) as Record<ProEvent, boolean> };
}

/** Aceita o que estiver no banco (ou nada) e devolve preferências completas. Chaves desconhecidas são ignoradas. */
export function normalizePrefs(raw: unknown): ProNotifyPrefs {
  const base = defaultPrefs();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as { enabled?: unknown; events?: unknown };
  if (typeof r.enabled === "boolean") base.enabled = r.enabled;
  if (r.events && typeof r.events === "object") {
    for (const e of PRO_EVENTS) {
      const v = (r.events as Record<string, unknown>)[e];
      if (typeof v === "boolean") base.events[e] = v;
    }
  }
  return base;
}

export function isEventEnabled(prefs: ProNotifyPrefs, event: ProEvent): boolean {
  return prefs.enabled && prefs.events[event];
}

/** De um formulário com checkboxes: "enabled" + um por evento (ausente = desligado). */
export function prefsFromForm(get: (name: string) => boolean): ProNotifyPrefs {
  return { enabled: get("enabled"), events: Object.fromEntries(PRO_EVENTS.map((e) => [e, get(`event_${e}`)])) as Record<ProEvent, boolean> };
}

/** Texto do rodapé: qual preferência desliga este aviso. */
export function unsubscribeHint(event: ProEvent): string {
  return `Você recebe este aviso porque "${PRO_EVENT_LABEL[event].title}" está ligado em Configurações → Notificações.`;
}
