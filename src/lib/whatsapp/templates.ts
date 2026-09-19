/**
 * Catálogo de templates de WhatsApp.
 *
 * Cada entrada mapeia um NotificationType para o nome do template aprovado
 * na Meta e a ordem exata das variáveis {{1}}, {{2}}… do corpo.
 *
 * Os textos abaixo são a referência do que deve ser cadastrado no
 * WhatsApp Manager. Ao mudar o texto lá, atualize aqui.
 *
 * REGRA: nenhuma variável pode carregar conteúdo clínico. Só nome, profissional,
 * modalidade, data, hora e links.
 */

import type { NotificationType } from "@/generated/prisma/enums";

export type TemplateSpec = {
  name: string;
  /** Texto de referência (pt_BR) cadastrado na Meta. */
  reference: string;
  /** Nomes das variáveis na ordem {{1}}, {{2}}, … */
  variables: readonly string[];
  /** Botão de URL dinâmica? Sufixo é appendado à base cadastrada no template. */
  urlButton?: { index: number; baseUrl: string };
};

export const TEMPLATES: Record<NotificationType, TemplateSpec> = {
  BOOKING_REQUEST: {
    name: "hecca_booking_request",
    reference:
      "Olá, {{1}}! Recebemos sua solicitação de agendamento com {{2}}.\n" +
      "Modalidade: {{3}}\nData: {{4}}\nHorário: {{5}}\n" +
      "Clique abaixo para confirmar seu horário.",
    variables: ["patientFirstName", "professionalName", "modality", "date", "time"],
    urlButton: { index: 0, baseUrl: "/confirmar/" },
  },
  BOOKING_CONFIRMED: {
    name: "hecca_booking_confirmed",
    reference:
      "✅ Seu atendimento foi confirmado.\n" +
      "Profissional: {{1}}\nModalidade: {{2}}\nData: {{3}}\nHorário: {{4}}\n" +
      "Até o nosso encontro.",
    variables: ["professionalName", "modality", "date", "time"],
  },
  REMINDER_24H: {
    name: "hecca_reminder_24h",
    reference:
      "Olá, {{1}}! Este é um lembrete do seu atendimento psicológico agendado para amanhã, às {{2}}.\n" +
      "Caso precise reagendar, entre em contato com antecedência.",
    variables: ["patientFirstName", "time"],
  },
  REMINDER_2H: {
    name: "hecca_reminder_2h",
    reference: "Olá, {{1}}! Seu atendimento começa às {{2}}. Até já.",
    variables: ["patientFirstName", "time"],
  },
  SESSION_LINK: {
    name: "hecca_session_link",
    reference:
      "Olá, {{1}}! Seu atendimento online com {{2}} é hoje às {{3}}.\n" +
      "Plataforma: {{4}}\nAcesse pelo botão abaixo.",
    variables: ["patientFirstName", "professionalName", "time", "platform"],
    urlButton: { index: 0, baseUrl: "/sessao/" },
  },
  CANCELLATION: {
    name: "hecca_cancellation",
    reference:
      "Seu atendimento de {{1}} às {{2}} foi cancelado conforme solicitado. " +
      "Caso queira, entre em contato para verificar novas disponibilidades.",
    variables: ["date", "time"],
  },
  WAITLIST_JOINED: {
    name: "hecca_waitlist_joined",
    reference:
      "Olá, {{1}}! Você entrou na lista de espera de {{2}}.\n" +
      "Assim que surgir um horário compatível, avisaremos por aqui com um link para confirmar.",
    variables: ["patientFirstName", "professionalName"],
  },
  WAITLIST_OFFER: {
    name: "hecca_waitlist_offer",
    reference:
      "Olá, {{1}}! Surgiu um horário com {{2}}.\n" +
      "Modalidade: {{3}}\nData: {{4}}\nHorário: {{5}}\n" +
      "Ele fica reservado para você por {{6}}h. Clique abaixo para confirmar ou recusar.",
    variables: ["patientFirstName", "professionalName", "modality", "date", "time", "holdHours"],
    urlButton: { index: 0, baseUrl: "/confirmar/" },
  },
  RESCHEDULE: {
    name: "hecca_reschedule",
    reference:
      "Olá, {{1}}! Seu atendimento com {{2}} foi reagendado.\n" +
      "Nova data: {{3}}\nNovo horário: {{4}}",
    variables: ["patientFirstName", "professionalName", "date", "time"],
  },
};

/** Constrói o array de variáveis na ordem esperada pelo template. */
export function buildVariables(
  type: NotificationType,
  values: Record<string, string>,
): string[] {
  const spec = TEMPLATES[type];
  return spec.variables.map((key) => {
    const v = values[key];
    if (v === undefined) throw new Error(`Template ${spec.name}: variável "${key}" ausente`);
    return v;
  });
}
