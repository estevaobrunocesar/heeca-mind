"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { cancelQueuedNotifications, enqueueAppointmentNotification, scheduleReminder } from "@/lib/notifications";
import { syncWaitlistForAppointment } from "@/lib/waitlist";
import { clientIp, rateLimit, retryMessage, RULES } from "@/lib/rate-limit";

/**
 * Ações do paciente via link do WhatsApp. O token é a credencial: 24 bytes
 * aleatórios, único por sessão. Sem login.
 */

/** Barra varredura de tokens por IP. */
async function guard(): Promise<string | null> {
  const ip = await clientIp();
  if (!ip) return null;
  const r = await rateLimit(RULES.tokenActionIp, ip);
  return r.ok ? null : retryMessage(r.retryAfterSeconds);
}

async function byToken(token: string) {
  return db.appointment.findUnique({
    where: { confirmationToken: token },
    select: {
      id: true,
      organizationId: true,
      status: true,
      startsAt: true,
      professional: { select: { scheduleSettings: { select: { minCancelHours: true } } } },
    },
  });
}

export async function confirmByTokenAction(token: string): Promise<{ ok: boolean; message: string }> {
  const limited = await guard();
  if (limited) return { ok: false, message: limited };
  const a = await byToken(token);
  if (!a) return { ok: false, message: "Link inválido." };
  if (a.status === "CONFIRMED") return { ok: true, message: "Este horário já está confirmado." };
  if (a.status !== "AWAITING_CONFIRMATION" && a.status !== "PENDING") {
    return { ok: false, message: "Este agendamento não pode mais ser confirmado." };
  }
  if (a.startsAt < new Date()) return { ok: false, message: "Este horário já passou." };

  await db.appointment.update({ where: { id: a.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await audit(null, { organizationId: a.organizationId, action: "appointment.confirm", entityType: "Appointment", entityId: a.id, after: { by: "patient_token" } });
  await enqueueAppointmentNotification(a.id, "BOOKING_CONFIRMED");
  await scheduleReminder(a.id, a.startsAt);
  await syncWaitlistForAppointment(a.id);
  revalidatePath(`/confirmar/${token}`);
  return { ok: true, message: "Horário confirmado. Até lá!" };
}

export async function cancelByTokenAction(token: string): Promise<{ ok: boolean; message: string }> {
  const limited = await guard();
  if (limited) return { ok: false, message: limited };
  const a = await byToken(token);
  if (!a) return { ok: false, message: "Link inválido." };
  if (a.status === "CANCELLED_BY_PATIENT") return { ok: true, message: "Este agendamento já foi cancelado." };
  if (!["AWAITING_CONFIRMATION", "PENDING", "CONFIRMED"].includes(a.status)) {
    return { ok: false, message: "Este agendamento não pode mais ser cancelado por aqui." };
  }

  const minHours = a.professional.scheduleSettings?.minCancelHours ?? 24;
  const limit = new Date(a.startsAt.getTime() - minHours * 60 * 60 * 1000);
  if (new Date() > limit) {
    return {
      ok: false,
      message: `O prazo para cancelar por aqui (${minHours}h antes) já passou. Fale diretamente com o profissional.`,
    };
  }

  await db.appointment.update({
    where: { id: a.id },
    data: { status: "CANCELLED_BY_PATIENT", cancelledAt: new Date(), cancelReason: "Cancelado pelo paciente via link" },
  });
  await audit(null, { organizationId: a.organizationId, action: "appointment.cancel_by_patient", entityType: "Appointment", entityId: a.id, after: { by: "patient_token" } });
  await cancelQueuedNotifications(a.id);
  await enqueueAppointmentNotification(a.id, "CANCELLATION");
  await syncWaitlistForAppointment(a.id);
  revalidatePath(`/confirmar/${token}`);
  return { ok: true, message: "Agendamento cancelado." };
}
