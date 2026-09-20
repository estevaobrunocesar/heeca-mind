"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canTransition, targetStatus, type AppointmentAction } from "@/lib/appointment-status";
import { audit } from "@/lib/audit";
import { addDaysCivil, findHardConflicts, weekdayOfCivilDate } from "@/lib/availability";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { cancelQueuedNotifications, enqueueAppointmentNotification, scheduleReminder } from "@/lib/notifications";
import { canManageSchedule } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { getAppointmentInTenant } from "@/lib/tenant";
import { syncWaitlistForAppointment } from "@/lib/waitlist";
import { dateTimeInTz, formatDateTimeBR } from "@/lib/time";
import {
  adminNoteSchema,
  cancelSchema,
  createAppointmentSchema,
  onlineLinkSchema,
  rescheduleSchema,
} from "@/lib/validation/appointment";

async function ctx() {
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { timezone: true },
  });
  return { actor, tz: org.timezone };
}

/** Conflitos duros (sessões ativas e bloqueios) para um intervalo. */
async function hardConflicts(professionalId: string, start: Date, end: Date, excludeId?: string) {
  const [appts, blocks] = await Promise.all([
    db.appointment.findMany({
      where: {
        professionalId,
        status: { in: [...ACTIVE_STATUSES] },
        startsAt: { lt: end },
        endsAt: { gt: start },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, startsAt: true, endsAt: true, patient: { select: { name: true } } },
    }),
    db.scheduleBlock.findMany({
      where: { professionalId, startsAt: { lt: end }, endsAt: { gt: start } },
      select: { startsAt: true, endsAt: true, type: true },
    }),
  ]);
  return findHardConflicts(
    { start, end },
    appts.map((a) => ({ id: a.id, start: a.startsAt, end: a.endsAt, name: a.patient.name })),
    blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
  );
}

function describeConflicts(c: Awaited<ReturnType<typeof hardConflicts>>, tz: string) {
  const parts: string[] = [];
  for (const a of c.appointments) {
    const named = a as typeof a & { name?: string };
    parts.push(`sessão de ${named.name ?? "paciente"} às ${formatDateTimeBR(a.start, tz)}`);
  }
  for (const b of c.blocks) parts.push(`bloqueio ${formatDateTimeBR(b.start, tz)}–${formatDateTimeBR(b.end, tz)}`);
  return parts.join("; ");
}

// ──────────────────────────────────────────────────────────────
// Criar (manual) — com paciente novo/existente e recorrência opcional
// ──────────────────────────────────────────────────────────────

export async function createAppointmentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, tz } = await ctx();
  if (!actor.activeProfessionalId) return { error: "Usuário sem perfil profissional" };
  const professionalId = actor.activeProfessionalId;
  if (!canManageSchedule(actor, professionalId)) return { error: "Sem permissão" };

  const parsed = createAppointmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const service = await db.service.findFirst({ where: { id: d.serviceId, professionalId } });
  if (!service) return { fieldErrors: { serviceId: ["Serviço inválido"] }, values: formValues(formData) };
  if (service.modality !== "HYBRID" && service.modality !== d.modality) {
    return { fieldErrors: { modality: ["Este serviço não permite essa modalidade"] }, values: formValues(formData) };
  }

  // Paciente: reaproveita pelo WhatsApp (único por organização) ou cria.
  let patientId = d.patientId;
  if (!patientId) {
    const whatsapp = d.newPatientWhatsapp!;
    const patient = await db.patient.upsert({
      where: { organizationId_whatsapp: { organizationId: actor.organizationId, whatsapp } },
      create: { organizationId: actor.organizationId, name: d.newPatientName, whatsapp, usualModality: d.modality },
      update: {},
    });
    patientId = patient.id;
  } else {
    const ok = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
    if (!ok) return { fieldErrors: { patientId: ["Paciente inválido"] }, values: formValues(formData) };
  }

  // Datas da série (ou só a primeira).
  const dates: string[] = [d.date];
  if (d.recurrence !== "NONE" && d.recurrenceUntil) {
    const step = d.recurrence === "WEEKLY" ? 7 : 14;
    for (let next = addDaysCivil(d.date, step); next <= d.recurrenceUntil && dates.length < 104; next = addDaysCivil(next, step)) {
      dates.push(next);
    }
  }

  const durationMs = service.durationMinutes * 60_000;
  const slots = dates.map((date) => {
    const start = dateTimeInTz(date, d.time, tz);
    return { date, start, end: new Date(start.getTime() + durationMs) };
  });

  // Conflitos duros. Sem `force`, qualquer conflito impede tudo.
  const conflicting: string[] = [];
  const skipped = new Set<string>();
  for (const s of slots) {
    const c = await hardConflicts(professionalId, s.start, s.end);
    if (c.appointments.length > 0 || c.blocks.length > 0) {
      conflicting.push(`${formatDateTimeBR(s.start, tz)}: ${describeConflicts(c, tz)}`);
      skipped.add(s.date);
    }
  }
  if (conflicting.length > 0 && !d.force) {
    return {
      error:
        `Conflito em ${conflicting.length} horário(s): ${conflicting.slice(0, 3).join(" | ")}` +
        (conflicting.length > 3 ? ` (+${conflicting.length - 3})` : "") +
        (slots.length > 1 ? ". Marque \"pular conflitos\" para criar apenas os horários livres." : ""),
      values: formValues(formData),
    };
  }

  const created = await db.$transaction(async (tx) => {
    let seriesId: string | null = null;
    if (slots.length > 1) {
      const series = await tx.recurringSeries.create({
        data: {
          professionalId,
          patientId,
          serviceId: service.id,
          frequency: d.recurrence === "WEEKLY" ? "WEEKLY" : "BIWEEKLY",
          weekday: weekdayOfCivilDate(d.date),
          startTime: d.time,
          modality: d.modality,
          startsOn: new Date(`${d.date}T00:00:00Z`),
          endsOn: d.recurrenceUntil ? new Date(`${d.recurrenceUntil}T00:00:00Z`) : null,
        },
      });
      seriesId = series.id;
    }

    const ids: string[] = [];
    for (const s of slots) {
      if (skipped.has(s.date)) continue;
      const a = await tx.appointment.create({
        data: {
          organizationId: actor.organizationId,
          professionalId,
          patientId,
          serviceId: service.id,
          seriesId,
          startsAt: s.start,
          endsAt: s.end,
          modality: d.modality,
          status: "CONFIRMED", // marcado pelo profissional = já combinado
          source: seriesId ? "RECURRING" : "MANUAL",
          serviceNameSnapshot: service.name,
          priceCents: service.priceCents,
          durationMinutes: service.durationMinutes,
          adminNote: d.adminNote,
          confirmedAt: new Date(),
          confirmationToken: randomBytes(24).toString("base64url"),
        },
        select: { id: true, startsAt: true },
      });
      ids.push(a.id);
      await tx.patient.updateMany({ where: { id: patientId, firstAppointmentAt: null }, data: { firstAppointmentAt: s.start } });
    }
    return ids;
  });

  for (const id of created) {
    await audit(actor, { organizationId: actor.organizationId, action: "appointment.create", entityType: "Appointment", entityId: id });
    const a = await db.appointment.findUniqueOrThrow({ where: { id }, select: { startsAt: true } });
    await scheduleReminder(id, a.startsAt);
  }

  revalidatePath("/agenda");
  redirect(`/agenda?view=day&date=${d.date}${skipped.size > 0 ? `&skipped=${skipped.size}` : ""}`);
}

// ──────────────────────────────────────────────────────────────
// Transições de status
// ──────────────────────────────────────────────────────────────

async function transition(appointmentId: string, action: AppointmentAction, extra: Record<string, unknown> = {}) {
  const { actor } = await ctx();
  const before = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, before.professionalId)) throw new Error("Sem permissão");
  if (!canTransition(before.status, action)) {
    throw new Error(`Ação "${action}" não permitida a partir de ${before.status}`);
  }
  const after = await db.appointment.update({
    where: { id: appointmentId },
    data: { status: targetStatus(action), ...extra },
  });
  await audit(actor, {
    organizationId: actor.organizationId,
    action: `appointment.${action}`,
    entityType: "Appointment",
    entityId: appointmentId,
    before: { status: before.status },
    after: { status: after.status, ...extra },
  });
  await syncWaitlistForAppointment(appointmentId); // oferta da lista de espera, se houver
  revalidatePath("/agenda");
  revalidatePath(`/agenda/${appointmentId}`);
  return { before, after };
}

export async function confirmAppointmentAction(appointmentId: string) {
  const { after } = await transition(appointmentId, "confirm", { confirmedAt: new Date() });
  await enqueueAppointmentNotification(appointmentId, "BOOKING_CONFIRMED");
  await scheduleReminder(appointmentId, after.startsAt);
}

export async function requestConfirmationAction(appointmentId: string) {
  const a = await db.appointment.findUnique({ where: { id: appointmentId }, select: { confirmationToken: true } });
  const extra = a?.confirmationToken ? {} : { confirmationToken: randomBytes(24).toString("base64url") };
  await transition(appointmentId, "request_confirmation", extra);
  await enqueueAppointmentNotification(appointmentId, "BOOKING_REQUEST");
}

export async function startAppointmentAction(appointmentId: string) {
  await transition(appointmentId, "start");
}

export async function completeAppointmentAction(appointmentId: string) {
  const { after } = await transition(appointmentId, "complete", { completedAt: new Date() });
  // Base da reativação (§28): a última sessão concluída fica na ficha, sem varrer a agenda.
  await db.patient.updateMany({ where: { id: after.patientId, OR: [{ lastCompletedAt: null }, { lastCompletedAt: { lt: after.startsAt } }] }, data: { lastCompletedAt: after.startsAt } });
}

export async function noShowAppointmentAction(appointmentId: string) {
  await transition(appointmentId, "no_show");
  await cancelQueuedNotifications(appointmentId);
}

export async function cancelAppointmentAction(_prev: FormState & { appointmentId: string }, formData: FormData): Promise<FormState & { appointmentId: string }> {
  const appointmentId = _prev.appointmentId;
  const parsed = cancelSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { appointmentId, ...invalid(parsed.error, formData) };
  const { by, reason, scope } = parsed.data;
  const action: AppointmentAction = by === "patient" ? "cancel_by_patient" : "cancel_by_professional";

  const { before } = await transition(appointmentId, action, { cancelledAt: new Date(), cancelReason: reason });
  await cancelQueuedNotifications(appointmentId);
  await enqueueAppointmentNotification(appointmentId, "CANCELLATION");

  // Cancelar o restante da série: só sessões futuras ainda ativas.
  if (scope === "series" && before.seriesId) {
    const { actor } = await ctx();
    const rest = await db.appointment.findMany({
      where: { seriesId: before.seriesId, id: { not: appointmentId }, startsAt: { gt: before.startsAt }, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true },
    });
    for (const r of rest) {
      await db.appointment.update({
        where: { id: r.id },
        data: { status: targetStatus(action), cancelledAt: new Date(), cancelReason: reason },
      });
      await cancelQueuedNotifications(r.id);
      await audit(actor, { organizationId: actor.organizationId, action: `appointment.${action}`, entityType: "Appointment", entityId: r.id, after: { series: true } });
    }
    await db.recurringSeries.update({ where: { id: before.seriesId }, data: { isActive: false } });
    revalidatePath("/agenda");
  }

  redirect(`/agenda/${appointmentId}`);
}

export async function rescheduleAppointmentAction(_prev: FormState & { appointmentId: string }, formData: FormData): Promise<FormState & { appointmentId: string }> {
  const appointmentId = _prev.appointmentId;
  const { actor, tz } = await ctx();
  const parsed = rescheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { appointmentId, ...invalid(parsed.error, formData) };
  const { date, time, force } = parsed.data;

  const before = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, before.professionalId)) throw new Error("Sem permissão");
  if (!canTransition(before.status, "reschedule")) {
    return { appointmentId, error: "Esta sessão não pode mais ser reagendada." };
  }

  const start = dateTimeInTz(date, time, tz);
  const end = new Date(start.getTime() + before.durationMinutes * 60_000);
  const c = await hardConflicts(before.professionalId, start, end, appointmentId);
  if ((c.appointments.length > 0 || c.blocks.length > 0) && !force) {
    return { appointmentId, error: `Conflito: ${describeConflicts(c, tz)}`, values: formValues(formData) };
  }

  await db.appointment.update({
    where: { id: appointmentId },
    data: { startsAt: start, endsAt: end, status: "CONFIRMED", confirmedAt: new Date() },
  });
  await audit(actor, {
    organizationId: actor.organizationId,
    action: "appointment.reschedule",
    entityType: "Appointment",
    entityId: appointmentId,
    before: { startsAt: before.startsAt, status: before.status },
    after: { startsAt: start, status: "CONFIRMED" },
  });
  await cancelQueuedNotifications(appointmentId);
  await enqueueAppointmentNotification(appointmentId, "RESCHEDULE");
  await scheduleReminder(appointmentId, start);

  revalidatePath("/agenda");
  redirect(`/agenda/${appointmentId}`);
}

// ──────────────────────────────────────────────────────────────
// Campos administrativos
// ──────────────────────────────────────────────────────────────

export async function updateAdminNoteAction(_prev: FormState & { appointmentId: string }, formData: FormData): Promise<FormState & { appointmentId: string }> {
  const appointmentId = _prev.appointmentId;
  const { actor } = await ctx();
  const parsed = adminNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { appointmentId, ...invalid(parsed.error, formData) };
  const before = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, before.professionalId)) throw new Error("Sem permissão");
  await db.appointment.update({ where: { id: appointmentId }, data: { adminNote: parsed.data.adminNote } });
  await audit(actor, { organizationId: actor.organizationId, action: "appointment.note", entityType: "Appointment", entityId: appointmentId });
  revalidatePath(`/agenda/${appointmentId}`);
  return { appointmentId, ok: true };
}

export async function updateOnlineLinkAction(_prev: FormState & { appointmentId: string }, formData: FormData): Promise<FormState & { appointmentId: string }> {
  const appointmentId = _prev.appointmentId;
  const { actor } = await ctx();
  const parsed = onlineLinkSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { appointmentId, ...invalid(parsed.error, formData) };
  const before = await getAppointmentInTenant(actor, appointmentId);
  if (!canManageSchedule(actor, before.professionalId)) throw new Error("Sem permissão");
  await db.appointment.update({ where: { id: appointmentId }, data: { onlineLink: parsed.data.onlineLink } });
  await audit(actor, { organizationId: actor.organizationId, action: "appointment.link", entityType: "Appointment", entityId: appointmentId });
  revalidatePath(`/agenda/${appointmentId}`);
  return { appointmentId, ok: true };
}
