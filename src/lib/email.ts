import "server-only";

/**
 * Envio de e-mail transacional. Sem provedor configurado, imprime no console.
 * Trocar por Resend/SES/Postmark quando definido — a interface nao muda.
 */
export async function sendEmail(input: { to: string; subject: string; text: string }) {
  console.info(`[email] to=${input.to} subject="${input.subject}"\n${input.text}`);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  await sendEmail({
    to,
    subject: "Redefinicao de senha — Hecca Psico",
    text:
      `Recebemos um pedido para redefinir sua senha.\n\n` +
      `Acesse o link abaixo (valido por 1 hora):\n${resetUrl}\n\n` +
      `Se voce nao solicitou, ignore esta mensagem.`,
  });
}
