import "server-only";

/**
 * Contrato do provedor de WhatsApp.
 *
 * A aplicação NUNCA monta texto livre: sempre envia (templateName, variáveis).
 * Isso casa com a exigência da Meta (mensagens iniciadas pelo negócio precisam
 * de template aprovado) e, de quebra, impede que qualquer campo não previsto
 * — como uma observação clínica — chegue ao paciente por engano.
 */

export type TemplateVariable = string;

export type SendTemplateInput = {
  /** Telefone em E.164, ex.: +5511999999999 */
  to: string;
  templateName: string;
  languageCode?: string; // default pt_BR
  bodyVariables: TemplateVariable[];
  /** Botões de URL dinâmica (ex.: link de confirmação). Índice = posição do botão no template. */
  buttonUrlSuffixes?: Array<{ index: number; suffix: string }>;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
}
