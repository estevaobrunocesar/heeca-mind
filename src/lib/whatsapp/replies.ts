/**
 * Interpretação da resposta do paciente a uma mensagem de WhatsApp.
 * Puro, sem banco — testado em tests/replies.test.ts.
 */

const YES = /^(sim|s|1|ok|confirmar|confirmo|confirmado|pode confirmar|✅)$/;
const NO = /^(nao|n|2|cancelar|cancela|cancelo|desmarcar|nao vou|nao poderei|❌)$/;

export function normalizeReply(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.!,]+$/, "")
    .replace(/\s+/g, " ");
}

export type ReplyIntent = "yes" | "no" | null;

export function parseReply(text: string): ReplyIntent {
  const n = normalizeReply(text);
  if (YES.test(n)) return "yes";
  if (NO.test(n)) return "no";
  return null;
}

/** Extrai o texto útil de um evento de mensagem da Meta (texto, botão ou interativo). */
export function replyTextFrom(m: {
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: { button_reply?: { id?: string; title?: string } };
}): string {
  return m.text?.body ?? m.button?.payload ?? m.button?.text ?? m.interactive?.button_reply?.id ?? m.interactive?.button_reply?.title ?? "";
}

export type ButtonIntent = "confirm" | "reschedule" | "cancel";

/**
 * Payload dos botões quick_reply dos templates (`<intenção>:<token>`, ver templates.ts).
 * Texto livre ou botão sem token → null; o chamador cai no parseReply por telefone.
 */
export function parseButtonPayload(id: string): { intent: ButtonIntent; token: string } | null {
  const m = /^(confirm|reschedule|cancel):([A-Za-z0-9_-]{16,})$/.exec(id.trim());
  return m ? { intent: m[1] as ButtonIntent, token: m[2] } : null;
}
