import "server-only";

/**
 * E-mail transacional. Drivers: console (default, dev), smtp (nodemailer),
 * resend (HTTP). Escolhido por EMAIL_DRIVER. Interface única para que o
 * dispatcher trate e-mail como trata WhatsApp: resultado com retryable.
 */
export type EmailMessage = { to: string; subject: string; text: string; html?: string };

export type EmailResult = { ok: true; providerMessageId?: string } | { ok: false; error: string; retryable: boolean };

export interface EmailProvider {
  readonly name: string;
  send(msg: EmailMessage): Promise<EmailResult>;
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Heeca Mind <no-reply@localhost>";
}
