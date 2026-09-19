import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "./db";
import { formatDateBR, slotLabelInTz } from "./time";
import { buildVariables, TEMPLATES } from "./whatsapp/templates";

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
  type: NotificationType,
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
      patient: { select: { id: true, name: true, whatsapp: true } },
      professional: {
        select: {
          displayName: true,
          onlinePlatform: true,
          organization: { select: { timezone: true } },
          scheduleSettings: { select: { confirmationTimeoutHours: true } },
        },
      },
    },
  });

  const tz = a.professional.organization.timezone;
  const values: Record<string, string> = {
    patientFirstName: a.patient.name.split(" ")[0] ?? a.patient.name,
    professionalName: a.professional.displayName,
    modality: a.modality === "ONLINE" ? "Online" : "Presencial",
    date: formatDateBR(a.startsAt, tz),
    time: slotLabelInTz(a.startsAt, tz),
    platform: PLATFORM_LABEL[a.professional.onlinePlatform ?? "OTHER"],
    holdHours: String(a.professional.scheduleSettings?.confirmationTimeoutHours ?? 24),
  };

  const spec = TEMPLATES[type];
  const payload: { bodyVariables: string[]; buttonUrlSuffixes?: Array<{ index: number; suffix: string }> } = {
    bodyVariables: buildVariables(type, values),
  };
  if (spec.urlButton) {
    // Sufixo da URL dinâmica: sempre o token (não adivinhável), nunca o id.
    if (!a.confirmationToken) throw new Error(`Agendamento ${a.id} sem token para botão de URL`);
    payload.buttonUrlSuffixes = [{ index: spec.urlButton.index, suffix: a.confirmationToken }];
  }

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
  const a = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId }, select: { modality: true } });
  const plan: Array<{ type: NotificationType; at: Date }> = [
    { type: "REMINDER_24H", at: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000) },
  ];
  if (a.modality === "ONLINE") plan.push({ type: "SESSION_LINK", at: new Date(startsAt.getTime() - 2 * 60 * 60 * 1000) });

  for (const { type, at } of plan) {
    if (at <= new Date()) continue;
    const exists = await db.notification.findFirst({ where: { appointmentId, type, status: "QUEUED" }, select: { id: true } });
    if (exists) continue;
    await enqueueAppointmentNotification(appointmentId, type, { scheduledFor: at });
  }
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
