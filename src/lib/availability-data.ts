import "server-only";
import { db } from "./db";
import { addDaysCivil, type AvailabilityInput } from "./availability";
import { dateTimeInTz } from "./time";

/** Status que ocupam horário na agenda. */
export const ACTIVE_STATUSES = [
  "PENDING",
  "AWAITING_CONFIRMATION",
  "CONFIRMED",
  "RESCHEDULE_REQUESTED",
  "AWAITING_PAYMENT",
] as const;

/**
 * Monta o AvailabilityInput de um profissional para um intervalo de datas
 * civis. Carrega só o necessário: sessões e bloqueios que tocam o período.
 *
 * `excludeAppointmentId` permite reagendar: a própria sessão não deve
 * bloquear os horários candidatos.
 */
export async function loadAvailabilityInput(params: {
  professionalId: string;
  fromISO: string;
  toISO: string;
  durationMinutes: number;
  now?: Date;
  excludeAppointmentId?: string;
}): Promise<AvailabilityInput> {
  const { professionalId, fromISO, toISO, durationMinutes } = params;

  const pro = await db.professional.findUniqueOrThrow({
    where: { id: professionalId },
    select: {
      organization: { select: { timezone: true } },
      scheduleSettings: true,
      availability: { select: { weekday: true, startTime: true, endTime: true } },
    },
  });
  const tz = pro.organization.timezone;

  // Margem de um dia de cada lado para cobrir sessões que cruzam a meia-noite no fuso.
  const rangeStart = dateTimeInTz(addDaysCivil(fromISO, -1), "00:00", tz);
  const rangeEnd = dateTimeInTz(addDaysCivil(toISO, 1), "23:59", tz);

  const [exceptions, blocks, appointments] = await Promise.all([
    db.scheduleException.findMany({
      where: { professionalId, date: { gte: new Date(`${fromISO}T00:00:00Z`), lte: new Date(`${toISO}T00:00:00Z`) } },
      select: { date: true, startTime: true, endTime: true },
    }),
    db.scheduleBlock.findMany({
      where: { professionalId, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { startsAt: true, endsAt: true },
    }),
    db.appointment.findMany({
      where: {
        professionalId,
        status: { in: [...ACTIVE_STATUSES] },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(params.excludeAppointmentId ? { id: { not: params.excludeAppointmentId } } : {}),
      },
      select: { startsAt: true, endsAt: true },
    }),
  ]);

  const s = pro.scheduleSettings;
  return {
    tz,
    rules: pro.availability,
    exceptions: exceptions.map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      startTime: e.startTime,
      endTime: e.endTime,
    })),
    blocks: blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    appointments: appointments.map((a) => ({ start: a.startsAt, end: a.endsAt })),
    settings: {
      bufferMinutes: s?.bufferMinutes ?? 10,
      slotStepMinutes: s?.slotStepMinutes ?? 30,
      minAdvanceHours: s?.minAdvanceHours ?? 24,
      maxBookingDaysAhead: s?.maxBookingDaysAhead ?? 60,
      maxSessionsPerDay: s?.maxSessionsPerDay ?? null,
    },
    durationMinutes,
    now: params.now ?? new Date(),
  };
}
