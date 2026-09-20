import "server-only";
import { emailFrom, type EmailMessage, type EmailProvider, type EmailResult } from "./provider";

/** Resend (https://resend.com) pela API HTTP — sem SDK. RESEND_API_KEY obrigatório. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  private readonly apiKey: string;

  constructor(apiKey = process.env.RESEND_API_KEY) {
    if (!apiKey) throw new Error("RESEND_API_KEY é obrigatório com EMAIL_DRIVER=resend");
    this.apiKey = apiKey;
  }

  async send(msg: EmailMessage): Promise<EmailResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from: emailFrom(), to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      });
      if (res.ok) {
        const data = (await res.json()) as { id?: string };
        return { ok: true, providerMessageId: data.id };
      }
      const body = (await res.text()).slice(0, 300);
      return { ok: false, error: `Resend ${res.status}: ${body}`, retryable: res.status === 429 || res.status >= 500 };
    } catch (e) {
      return { ok: false, error: (e as Error).message, retryable: true };
    }
  }
}
