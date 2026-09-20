import "server-only";
import { signBody } from "@/lib/heeca/core";
import type { SendResult, SendTemplateInput, WhatsAppProvider } from "./provider";

/**
 * Provedor via Heeca Notify (heeca_notify/README.md). Nenhum token da Meta vive aqui:
 * o Mind assina o pedido com NOTIFY_SECRET (= NOTIFY_SECRET_MIND no Notify) e recebe
 * status/respostas por callback assinado em /api/webhooks/notify.
 *
 * Variáveis: WHATSAPP_PROVIDER=notify, NOTIFY_URL, NOTIFY_SECRET, NOTIFY_PRODUCT (default mind).
 */

export const notifyProduct = () => process.env.NOTIFY_PRODUCT ?? "mind";
export const notifySecret = () => process.env.NOTIFY_SECRET ?? "";
const notifyUrl = () => (process.env.NOTIFY_URL ?? "").replace(/\/+$/, "");
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");

export function notifyHeaders(rawBody: string): Record<string, string> {
  const { ts, sig } = signBody(notifySecret(), rawBody);
  return { "Content-Type": "application/json", "X-Heeca-Product": notifyProduct(), "X-Heeca-Timestamp": ts, "X-Heeca-Signature": sig, "User-Agent": "HeecaMind/1.0" };
}

/** Corpo do POST /api/v1/messages, na forma do `enqueueSchema` do Notify. Puro — testado. */
export function buildNotifyRequest(input: SendTemplateInput, callbackUrl: string) {
  return {
    tenantId: input.tenantId,
    tenantName: input.tenantName?.slice(0, 120),
    ref: input.ref,
    callbackUrl,
    message: {
      kind: "template" as const,
      to: input.to,
      name: input.templateName,
      language: input.languageCode ?? "pt_BR",
      bodyParams: input.bodyVariables,
      body: input.body.slice(0, 4096),
      ...(input.buttons?.length ? { buttons: input.buttons } : {}),
    },
  };
}

export class NotifyWhatsAppProvider implements WhatsAppProvider {
  constructor() {
    if (!notifyUrl() || notifySecret().length < 16) throw new Error("WHATSAPP_PROVIDER=notify exige NOTIFY_URL e NOTIFY_SECRET (≥ 16)");
  }

  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    const raw = JSON.stringify(buildNotifyRequest(input, `${appUrl()}/api/webhooks/notify`));
    let res: Response;
    try {
      res = await fetch(`${notifyUrl()}/api/v1/messages`, { method: "POST", headers: notifyHeaders(raw), body: raw, signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "falha de rede", retryable: true };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; reason?: string; error?: string };
    if (!res.ok) {
      // 401 (segredo), 400/422 (template/parâmetros) são erros nossos: não adianta repetir.
      const retryable = res.status === 429 || res.status >= 500;
      return { ok: false, error: json.error ?? `Notify HTTP ${res.status}`, retryable };
    }
    if (json.status === "SKIPPED") return { ok: true, skipped: true, reason: json.reason ?? "ignorada pelo Notify" };
    if (!json.id) return { ok: false, error: "Notify respondeu sem id", retryable: false };
    return { ok: true, providerMessageId: json.id };
  }
}

/** Provedor que só registra no console — dev/test. Não confundir com entrega real. */
export class ConsoleWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(input: SendTemplateInput): Promise<SendResult> {
    console.info("[whatsapp:console]", input.templateName, "→", input.to, "\n" + input.body, input.buttons ?? "");
    return { ok: true, providerMessageId: `console-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "notify" ? new NotifyWhatsAppProvider() : new ConsoleWhatsAppProvider();
}
