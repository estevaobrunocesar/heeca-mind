import "server-only";
import type { EmailMessage, EmailProvider, EmailResult } from "./provider";

/** Sem provedor: imprime e considera enviado. Não confundir com entrega real. */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(msg: EmailMessage): Promise<EmailResult> {
    console.info(`[email:console] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return { ok: true, providerMessageId: `console-${Date.now()}` };
  }
}
