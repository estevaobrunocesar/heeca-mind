import "server-only";
import type { TemplateButton } from "./templates";

/**
 * Contrato do provedor de WhatsApp.
 *
 * A aplicação NUNCA monta texto livre: sempre envia (templateName, variáveis, botões).
 * Isso casa com a exigência da Meta (mensagens iniciadas pelo negócio precisam de
 * template aprovado) e impede que qualquer campo não previsto — como uma observação
 * clínica — chegue ao paciente por engano.
 *
 * Implementações: `NotifyWhatsAppProvider` (produção, via Heeca Notify) e
 * `ConsoleWhatsAppProvider` (dev/test) em ./notify.ts.
 */

export type SendTemplateInput = {
  /** Telefone em E.164, ex.: +5511999999999 */
  to: string;
  templateName: string;
  languageCode?: string; // default pt_BR
  bodyVariables: string[];
  buttons?: TemplateButton[];
  /** Texto de referência renderizado — o Notify guarda para log e para o provedor console. */
  body: string;
  /** Estabelecimento (tenant) e referência da mensagem, para roteamento do callback. */
  tenantId: string;
  tenantName?: string;
  ref: string;
};

export type SendResult =
  | { ok: true; providerMessageId: string }
  /** O Notify aceitou mas não vai enviar (opt-out do telefone, cota do mês). Não tentar de novo. */
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string; retryable: boolean };

export interface WhatsAppProvider {
  sendTemplate(input: SendTemplateInput): Promise<SendResult>;
}
