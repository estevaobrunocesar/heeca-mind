/**
 * Catálogo de templates de WhatsApp do Heeca Mind.
 *
 * O envio é feito pelo Heeca Notify (docs/mind/03-FLUXOS.md F6), que só aceita:
 *  - templates UNIFICADOS da plataforma (`heeca_confirmacao`, `heeca_confirmado`, `heeca_lembrete`,
 *    `heeca_cancelado`, `heeca_remarcado`, `heeca_sinal`, `heeca_retorno`) — fonte da verdade em
 *    `heeca_notify/src/lib/templates.ts`; nome, número de parâmetros e botões precisam bater;
 *  - templates ESPECÍFICOS do produto, com nome `heeca_mind_*` e URL base no nosso próprio host,
 *    cadastrados na mesma WABA pela plataforma (D10).
 *
 * Botões:
 *  - quick_reply: o payload é `<intenção>:<token de confirmação>`; volta como `button_reply` e
 *    `src/lib/whatsapp/replies.ts` resolve o agendamento pelo token (sem depender do telefone).
 *  - url: o sufixo é appendado à base fixa do template. Nos unificados a base é o redirecionador do
 *    portal (`heeca.com.br/a/` → agendar) e o Notify prefixa `mind/`; nos específicos é o nosso host.
 *
 * REGRA: nenhuma variável carrega conteúdo clínico. Só nome, estabelecimento, serviço, profissional,
 * modalidade, data, hora, orientações administrativas e links.
 */

import type { NotificationType } from "@/generated/prisma/enums";

/** Tipos que vão por WhatsApp (ao paciente). PRO_* são e-mails ao profissional. */
export type WhatsAppNotificationType = Exclude<NotificationType, `PRO_${string}`>;

export type TemplateButtonSpec =
  | { type: "quick_reply"; intent: "confirm" | "reschedule" | "cancel" }
  | { type: "url"; suffix: "confirmationToken" | "formToken" | "documentToken" | "portalToken" | "surveyToken" | "professionalSlug"; label: string };

export type TemplateSpec = {
  name: string;
  /** Texto de referência (pt_BR) como cadastrado na Meta. */
  reference: string;
  /** Nomes das variáveis na ordem {{1}}, {{2}}, … (chaves de `values` em notifications.ts). */
  variables: readonly string[];
  /** Botões, na ordem do template. */
  buttons?: readonly TemplateButtonSpec[];
  /** true = catálogo unificado do Notify; false = `heeca_mind_*`. */
  unified: boolean;
};

const CONFIRM_BUTTONS = [
  { type: "quick_reply", intent: "confirm" },
  { type: "quick_reply", intent: "reschedule" },
  { type: "quick_reply", intent: "cancel" },
] as const satisfies readonly TemplateButtonSpec[];

export const TEMPLATES: Record<WhatsAppNotificationType, TemplateSpec> = {
  BOOKING_REQUEST: {
    name: "heeca_confirmacao",
    unified: true,
    reference: "Olá, {{1}}! {{2}} recebeu sua solicitação: {{3}} com {{4}}, {{5}} às {{6}}. Toque em Confirmar para garantir seu horário.",
    variables: ["patientFirstName", "establishment", "service", "professionalName", "date", "time"],
    buttons: CONFIRM_BUTTONS,
  },
  BOOKING_CONFIRMED: {
    name: "heeca_confirmado",
    unified: true,
    reference: "Horário confirmado ✅ {{1}}: {{2}} com {{3}}, {{4}} às {{5}}. {{6}}Até lá!",
    variables: ["establishment", "service", "professionalName", "date", "time", "instructions"],
  },
  REMINDER_24H: {
    name: "heeca_lembrete",
    unified: true,
    reference: "Oi, {{1}}! Lembrete de {{2}}: {{3}}, {{4}} às {{5}}. Se precisar mudar, use os botões abaixo.",
    variables: ["patientFirstName", "establishment", "service", "when", "time"],
    buttons: [
      { type: "quick_reply", intent: "reschedule" },
      { type: "quick_reply", intent: "cancel" },
    ],
  },
  CANCELLATION: {
    name: "heeca_cancelado",
    unified: true,
    reference: "Aviso de {{1}}: seu horário de {{2}}, {{3}} às {{4}}, foi cancelado. Para marcar de novo, é só tocar no botão.",
    variables: ["establishment", "service", "date", "time"],
    buttons: [{ type: "url", suffix: "professionalSlug", label: "Agendar novamente" }],
  },
  RESCHEDULE: {
    name: "heeca_remarcado",
    unified: true,
    reference: "Aviso de {{1}}: seu horário de {{2}} foi remarcado para {{3}} às {{4}}. Qualquer dúvida, responda esta mensagem.",
    variables: ["establishment", "service", "date", "time"],
  },
  REACTIVATION: {
    name: "heeca_retorno",
    unified: true,
    reference: "Oi, {{1}}! Aqui é {{2}}. {{3}} Quer reservar seu próximo horário? É só tocar no botão.",
    variables: ["patientFirstName", "establishment", "invite"],
    buttons: [{ type: "url", suffix: "professionalSlug", label: "Agendar" }],
  },
  // ── Específicos do Mind (heeca_mind_*; base de URL = NEXT_PUBLIC_APP_URL) ──
  SURVEY: {
    name: "heeca_mind_pesquisa",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! Como foi sua experiência com o nosso atendimento? Leva menos de um minuto e nos ajuda a melhorar. Toque para responder.",
    variables: ["patientFirstName", "establishment"],
    buttons: [{ type: "url", suffix: "surveyToken", label: "Responder" }],
  },
  REMINDER_2H: {
    name: "heeca_mind_lembrete_2h",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! Sua sessão com {{3}} começa às {{4}}. Até já.",
    variables: ["patientFirstName", "establishment", "professionalName", "time"],
  },
  SESSION_LINK: {
    name: "heeca_mind_sessao_online",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! Sua sessão online com {{3}} é hoje às {{4}}.\nPlataforma: {{5}}\nAcesse pelo botão abaixo no horário combinado.",
    variables: ["patientFirstName", "establishment", "professionalName", "time", "platform"],
    buttons: [{ type: "url", suffix: "confirmationToken", label: "Acessar sessão" }],
  },
  WAITLIST_JOINED: {
    name: "heeca_mind_lista_espera",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! Você entrou na lista de espera de {{3}}.\nAssim que surgir um horário compatível, avisaremos por aqui com um link para confirmar.",
    variables: ["patientFirstName", "establishment", "professionalName"],
  },
  WAITLIST_OFFER: {
    name: "heeca_mind_oferta_horario",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! Surgiu um horário com {{3}}.\nModalidade: {{4}}\nData: {{5}}\nHorário: {{6}}\nEle fica reservado para você por {{7}}h. Toque abaixo para confirmar ou recusar.",
    variables: ["patientFirstName", "establishment", "professionalName", "modality", "date", "time", "holdHours"],
    buttons: [{ type: "url", suffix: "confirmationToken", label: "Responder" }],
  },
  DOCUMENT_REQUEST: {
    name: "heeca_mind_documento",
    unified: false,
    reference: "Mensagem de {{2}}: Olá, {{1}}! {{3}} enviou o documento \"{{4}}\" para você ler e aceitar.\nToque abaixo para abrir. O link vale por 30 dias.",
    variables: ["patientFirstName", "establishment", "professionalName", "documentTitle"],
    buttons: [{ type: "url", suffix: "documentToken", label: "Abrir documento" }],
  },
  PORTAL_LOGIN: {
    name: "heeca_mind_acesso_portal",
    unified: false,
    // Texto sem "vale por 15 min / uso único": a Meta rejeitou por soar como mensagem OTP/autenticação.
    // A regra em si (expiração e uso único do token) continua no servidor — só o texto mudou.
    reference: "Mensagem de {{2}}: Olá, {{1}}! Aqui está o link para você acompanhar seu atendimento. Toque no botão abaixo para entrar no seu espaço.",
    variables: ["patientFirstName", "establishment"],
    buttons: [{ type: "url", suffix: "portalToken", label: "Entrar no portal" }],
  },
  FORM_REQUEST: {
    name: "heeca_mind_formulario",
    unified: false,
    reference: 'Mensagem de {{2}}: Olá, {{1}}! {{3}} pede que você preencha o formulário "{{4}}" antes da sua sessão.\nLeva poucos minutos e suas respostas são confidenciais. Toque abaixo para responder.',
    variables: ["patientFirstName", "establishment", "professionalName", "formTitle"],
    buttons: [{ type: "url", suffix: "formToken", label: "Responder formulário" }],
  },
};

/** Caminho público que cada sufixo de URL abre no nosso host (templates específicos). */
export const URL_PATH_BY_SUFFIX: Record<Extract<TemplateButtonSpec, { type: "url" }>["suffix"], string> = {
  confirmationToken: "/confirmar/",
  formToken: "/formulario/",
  documentToken: "/documento/",
  portalToken: "/portal/entrar/",
  surveyToken: "/pesquisa/",
  professionalSlug: "/agendar/",
};

/** Botão como o Notify recebe (mesma forma do `enqueueSchema` dele). Persistido em Notification.payload. */
export type TemplateButton = { type: "quick_reply"; payload: string } | { type: "url"; text: string };

/** Payload persistido em `Notification.payload` para o canal WHATSAPP. */
export type WhatsAppPayload = { bodyVariables: string[]; buttons?: TemplateButton[] };

/** Constrói o array de variáveis na ordem esperada pelo template. */
export function buildVariables(type: WhatsAppNotificationType, values: Record<string, string>): string[] {
  const spec = TEMPLATES[type];
  return spec.variables.map((key) => {
    const v = values[key];
    if (v === undefined) throw new Error(`Template ${spec.name}: variável "${key}" ausente`);
    return v;
  });
}

/**
 * Constrói os botões a partir dos identificadores disponíveis. Lança se o template exige um
 * identificador que não veio — melhor falhar ao enfileirar do que mandar um botão quebrado.
 */
export function buildButtons(
  type: WhatsAppNotificationType,
  ids: { confirmationToken?: string | null; formToken?: string | null; documentToken?: string | null; portalToken?: string | null; surveyToken?: string | null; professionalSlug?: string | null },
): TemplateButton[] | undefined {
  const spec = TEMPLATES[type];
  if (!spec.buttons?.length) return undefined;
  return spec.buttons.map((b): TemplateButton => {
    if (b.type === "quick_reply") {
      if (!ids.confirmationToken) throw new Error(`Template ${spec.name}: botão ${b.intent} exige confirmationToken`);
      return { type: "quick_reply", payload: `${b.intent}:${ids.confirmationToken}` };
    }
    const v = ids[b.suffix];
    if (!v) throw new Error(`Template ${spec.name}: botão de URL exige ${b.suffix}`);
    return { type: "url", text: v };
  });
}

/** Renderiza o texto de referência com as variáveis — para o log e para o corpo enviado ao Notify. */
export function renderReference(type: WhatsAppNotificationType, bodyVariables: string[]): string {
  return TEMPLATES[type].reference.replace(/\{\{(\d+)\}\}/g, (_, i: string) => bodyVariables[Number(i) - 1] ?? "");
}

export function templateTypeByName(name: string): WhatsAppNotificationType | null {
  const hit = (Object.keys(TEMPLATES) as WhatsAppNotificationType[]).find((k) => TEMPLATES[k].name === name);
  return hit ?? null;
}
