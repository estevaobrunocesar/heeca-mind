import "server-only";
import type { SendResult, SendTemplateInput, WhatsAppProvider } from "./provider";

/**
 * Implementação para a Meta Cloud API (WhatsApp Business Platform).
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages/templates
 */

const GRAPH_VERSION = "v21.0";

type MetaError = {
  error?: { message?: string; code?: number; error_subcode?: number };
};

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(opts?: { phoneNumberId?: string; accessToken?: string }) {
    this.phoneNumberId = opts?.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
    this.accessToken = opts?.accessToken ?? process.env.WHATSAPP_ACCESS_TOKEN ?? "";
    if (!this.phoneNumberId || !this.accessToken) {
      throw new Error("WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN são obrigatórios");
    }
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const components: unknown[] = [];

    if (input.bodyVariables.length > 0) {
      components.push({
        type: "body",
        parameters: input.bodyVariables.map((text) => ({ type: "text", text })),
      });
    }

    for (const btn of input.buttonUrlSuffixes ?? []) {
      components.push({
        type: "button",
        sub_type: "url",
        index: String(btn.index),
        parameters: [{ type: "text", text: btn.suffix }],
      });
    }

    const body = {
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""), // Meta espera sem "+"
      type: "template",
      template: {
        name: input.templateName,
        language: { code: input.languageCode ?? "pt_BR" },
        components,
      },
    };

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${this.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );

    const json = (await res.json().catch(() => ({}))) as MetaError & {
      messages?: Array<{ id: string }>;
    };

    if (!res.ok) {
      const message = json.error?.message ?? `HTTP ${res.status}`;
      // 429 / 5xx são transitórios; 4xx de validação não.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: message, retryable };
    }

    const id = json.messages?.[0]?.id;
    if (!id) return { ok: false, error: "Resposta sem id de mensagem", retryable: false };
    return { ok: true, providerMessageId: id };
  }
}

/** Provedor que só registra no console — usado em dev/test sem credenciais. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    console.info("[whatsapp:console]", JSON.stringify(input));
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  if (process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return new MetaWhatsAppProvider();
  }
  return new ConsoleWhatsAppProvider();
}
