import "server-only";
import { ConsoleEmailProvider } from "./console";
import type { EmailMessage, EmailProvider } from "./provider";
import { ResendEmailProvider } from "./resend";
import { SmtpEmailProvider } from "./smtp";

let instance: EmailProvider | null = null;

/** Driver conforme EMAIL_DRIVER (default: console). */
export function getEmailProvider(): EmailProvider {
  if (instance) return instance;
  const driver = process.env.EMAIL_DRIVER ?? "console";
  instance = driver === "smtp" ? new SmtpEmailProvider() : driver === "resend" ? new ResendEmailProvider() : new ConsoleEmailProvider();
  return instance;
}

/**
 * Envio direto (síncrono), para fluxos de autenticação que não devem
 * esperar o cron: redefinição de senha e convite. Avisos ao profissional
 * vão pela fila (src/lib/pro-notify.ts).
 */
export async function sendEmail(input: EmailMessage): Promise<void> {
  const r = await getEmailProvider().send(input);
  if (!r.ok) throw new Error(`Falha ao enviar e-mail: ${r.error}`);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: "Redefinição de senha — Hecca Psico",
    text:
      `Recebemos um pedido para redefinir sua senha.\n\n` +
      `Acesse o link abaixo (válido por 1 hora):\n${resetUrl}\n\n` +
      `Se você não solicitou, ignore esta mensagem.`,
  });
}

export type { EmailMessage, EmailProvider, EmailResult } from "./provider";
