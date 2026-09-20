/**
 * Tradução do `InboundEvent` do Heeca Notify para o evento bruto que o dispatcher já processa
 * (status de entrega ou mensagem do paciente). Puro — testado em tests/notify.test.ts.
 *
 * `tenantId` e `ref` (= Notification.id) viajam junto: o processamento confere que o evento
 * pertence à notificação/organização certa antes de mexer em qualquer agendamento.
 */

export type NotifyInboundEvent = { tenantId?: string; ref?: string } & (
  | { type: "status"; providerMessageId: string; status: "sent" | "delivered" | "read" | "failed"; error?: string }
  | { type: "button_reply"; from: string; buttonId: string; providerMessageId: string; contextMessageId?: string }
  | { type: "text"; from: string; text: string; providerMessageId: string; contextMessageId?: string }
);

export type StatusEvent = { id: string; status: string; timestamp?: string; errors?: Array<{ title?: string; message?: string }>; tenantId?: string; ref?: string };
export type MessageEvent = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
  tenantId?: string;
  ref?: string;
};

export type RawWebhookEvent = { eventId: string; payload: StatusEvent | MessageEvent };

export function inboundToWebhookEvent(ev: NotifyInboundEvent): RawWebhookEvent | null {
  if (!ev || typeof ev !== "object" || typeof ev.providerMessageId !== "string" || !ev.providerMessageId) return null;
  const meta = { tenantId: ev.tenantId, ref: ev.ref };
  switch (ev.type) {
    case "status":
      return {
        eventId: `status:${ev.providerMessageId}:${ev.status}`,
        payload: { id: ev.providerMessageId, status: ev.status, ...(ev.error ? { errors: [{ message: ev.error }] } : {}), ...meta },
      };
    case "button_reply":
      return {
        // Um clique por mensagem de origem: repetir o mesmo botão não gera evento novo.
        eventId: `message:${ev.providerMessageId}:${ev.buttonId}`,
        payload: { id: ev.providerMessageId, from: ev.from, type: "interactive", interactive: { button_reply: { id: ev.buttonId } }, ...meta },
      };
    case "text":
      return {
        eventId: `message:${ev.providerMessageId}`,
        payload: { id: ev.providerMessageId, from: ev.from, type: "text", text: { body: ev.text }, ...meta },
      };
    default:
      return null;
  }
}
