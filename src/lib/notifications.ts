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
  };

  const spec = TEMPLATES[type];
  const payload: { bodyVariables: string[]; buttonUrlSuffixes?: Array<{ index: number; suffix: string }> } = {
    bodyVariables: buildVariables(type, values),
  };
  if (spec.urlButton) {
    // Sufixo da URL dinâmica: token de confirmação ou id da sessão.
    payload.buttonUrlSuffixes = [
      { index: spec.urlButton.index, suffix: type === "BOOKING_REQUEST" ? (a.confirmationToken ?? a.id) : a.id },
    ];
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

/** Agenda o lembrete de 24h, se ainda houver tempo. */
export async function scheduleReminder(appointmentId: string, startsAt: Date) {
  const remindAt = new Date(startsAt.getTime() - 24 * 60 * 60 * 1000);
  if (remindAt <= new Date()) return;
  await enqueueAppointmentNotification(appointmentId, "REMINDER_24H", { scheduledFor: remindAt });
}
