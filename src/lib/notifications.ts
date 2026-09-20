import "server-only";
import { db } from "./db";
import { formatDateBR, slotLabelInTz } from "./time";
import { buildButtons, buildVariables, TEMPLATES, type WhatsAppNotificationType, type WhatsAppPayload } from "./whatsapp/templates";
import { parseCommsPrefs, reminderAllowed } from "./comms-prefs";

/**
 * Enfileira notificações de WhatsApp para um agendamento.
 *
 * Só cria linhas em `Notification` com status QUEUED; o envio real é feito
 * pelo dispatcher (módulo 7). Separar "decidir o que enviar" de "enviar"
 * permite retry, auditoria e testes sem chamar a Meta.
 *
 * As variáveis são montadas a partir de um `select` fechado — nenhum campo
 * de observação (patientNote, adminNote) chega aqui.
 */
export async function enqueueAppointmentNotification(
  appointmentId: string,
  type: WhatsAppNotificationType,
  opts: { scheduledFor?: Date } = {},
) {
  const a = await db.appointment.findUniqueOrThrow({
    where: { id: appointmentId },
    select: {
      id: true,
      organizationId: true,
      startsAt: true,
      modality: true,
      confirmationToken: true,
      onlineLink: true,
      serviceNameSnapshot: true,
      patient: { select: { id: true, name: true, whatsapp: true } },
      service: { select: { patientInstructions: true } },
      professional: {
        select: {
          displayName: true,
          slug: true,
          onlinePlatform: true,
          organization: { select: { name: true, timezone: true, type: true } },
          scheduleSettings: { select: { confirmationTimeoutHours: true } },
        },
      },
    },
  });

  const tz = a.professional.organization.timezone;
  const modality = a.modality === "ONLINE" ? "Online" : "Presencial";
  const values: Record<string, string> = {
    patientFirstName: a.patient.name.split(" ")[0] ?? a.patient.name,
    professionalName: a.professional.displayName,
    // Templates unificados falam em "estabelecimento": para o autônomo é o próprio nome profissional.
    establishment: a.professional.organization.type === "CLINIC" ? a.professional.organization.name : a.professional.displayName,
    // O serviço leva a modalidade — para o paciente de psicologia isso é o dado que importa —
    // salvo quando o nome do serviço já a traz ("Sessão online").
    service: new RegExp(`\\b${modality}\\b`, "i").test(a.serviceNameSnapshot) ? a.serviceNameSnapshot : `${a.serviceNameSnapshot} (${modality.toLowerCase()})`,
    modality,
    date: formatDateBR(a.startsAt, tz),
    time: slotLabelInTz(a.startsAt, tz),
    when: "amanhã",
    // Orientações administrativas do serviço (nunca clínicas); a Meta não aceita parâmetro vazio → " ".
    instructions: instructionsParam(a.service.patientInstructions),
    platform: PLATFORM_LABEL[a.professional.onlinePlatform ?? "OTHER"],
    holdHours: String(a.professional.scheduleSettings?.confirmationTimeoutHours ?? 24),
  };

  const spec = TEMPLATES[type];
  const payload: WhatsAppPayload = {
    bodyVariables: buildVariables(type, values),
    // Sufixos/payloads dos botões: sempre o token (não adivinhável) ou o slug público, nunca o id.
    buttons: buildButtons(type, { confirmationToken: a.confirmationToken, professionalSlug: a.professional.slug }),
  };

  return db.notification.create({
    data: {
      organizationId: a.organizationId,
      appointmentId: a.id,
      patientId: a.patient.id,
      channel: "WHATSAPP",
      type,
      recipient: a.patient.whatsapp,
      templateName: spec.name,
      payload,
      scheduledFor: opts.scheduledFor ?? new Date(),
    },
  });
}

/** Parâmetro {{6}} do heeca_confirmado: frase curta terminada em espaço, ou " " quando não há orientações. */
function instructionsParam(text: string | null | undefined): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return " ";
  const cut = t.length > 160 ? t.slice(0, 157).trimEnd() + "…" : t;
  return /[.!?…]$/.test(cut) ? cut + " " : cut + ". ";
}

const PLATFORM_LABEL = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  TEAMS: "Microsoft Teams",
  OTHER: "plataforma indicada pelo profissional",
} as const;

/**
 * Cancela notificações ainda não enviadas de um agendamento (ex.: lembrete
 * de uma sessão que foi cancelada).
 */
export async function cancelQueuedNotifications(appointmentId: string) {
  await db.notification.updateMany({
    where: { appointmentId, status: "QUEUED" },
    data: { status: "FAILED", error: "cancelada: agendamento alterado" },
  });
}

/**
 * Agenda as mensagens automáticas de uma sessão confirmada:
 *  - lembrete 24h antes;
 *  - link da sala 2h antes, se online.
 * Idempotente: não duplica se já houver uma QUEUED do mesmo tipo.
 */
export async function scheduleReminder(appointmentId: string, startsAt: Date) {
  const a = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { modality: true, patient: { select: { commsPrefs: true } } } });
  const prefs = parseCommsPrefs(a.patient.commsPrefs);
  const plan: Array<{ type: "REMINDER_24H" | "REMINDER_2H" | "SESSION_LINK"; at: Date }> = [
    { type: "REMINDER_24H", at: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000) },
  ];
  if (a.modality === "ONLINE") plan.push({ type: "SESSION_LINK", at: new Date(startsAt.getTime() - 2 * 60 * 60 * 1000) });

  for (const { type, at } of plan) {
    if (at <= new Date()) continue;
    if (!reminderAllowed(prefs, type)) continue; // preferência do paciente (§12)
    const exists = await db.notification.findFirst({ where: { appointmentId, type, status: "QUEUED" }, select: { id: true } });
    if (exists) continue;
    await enqueueAppointmentNotification(appointmentId, type, { scheduledFor: at });
  }
}

/**
 * Pedido de formulário pré-atendimento. O sufixo do botão é o token em
 * claro (só o hash fica no banco), então ele vem por parâmetro.
 */
export async function enqueueFormRequest(requestId: string, token: string) {
  const r = await db.formRequest.findUniqueOrThrow({
    where: { id: requestId },
    select: {
      organizationId: true,
      appointmentId: true,
      titleSnapshot: true,
      patient: { select: { id: true, name: true, whatsapp: true } },
      professional: { select: { displayName: true } },
    },
  });
  const type = "FORM_REQUEST" as const;
  const spec = TEMPLATES[type];
  return db.notification.create({
    data: {
      organizationId: r.organizationId,
      appointmentId: r.appointmentId,
      patientId: r.patient.id,
      channel: "WHATSAPP",
      type,
      recipient: r.patient.whatsapp,
      templateName: spec.name,
      payload: {
        bodyVariables: buildVariables(type, {
          patientFirstName: r.patient.name.split(" ")[0] ?? r.patient.name,
          professionalName: r.professional.displayName,
          formTitle: r.titleSnapshot,
        }),
        buttons: buildButtons(type, { formToken: token }),
      } satisfies WhatsAppPayload,
    },
  });
}

/**
 * Confirmação de entrada na lista de espera. Sem agendamento: a notificação
 * fica ligada só ao paciente.
 */
export async function enqueueWaitlistJoined(entryId: string) {
  const e = await db.waitlistEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      organizationId: true,
      patient: { select: { id: true, name: true, whatsapp: true } },
      professional: { select: { displayName: true } },
    },
  });
  const type = "WAITLIST_JOINED" as const;
  return db.notification.create({
    data: {
      organizationId: e.organizationId,
      patientId: e.patient.id,
      channel: "WHATSAPP",
      type,
      recipient: e.patient.whatsapp,
      templateName: TEMPLATES[type].name,
      payload: {
        bodyVariables: buildVariables(type, {
          patientFirstName: e.patient.name.split(" ")[0] ?? e.patient.name,
          professionalName: e.professional.displayName,
        }),
      },
    },
  });
}
