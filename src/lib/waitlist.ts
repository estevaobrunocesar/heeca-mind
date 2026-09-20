import "server-only";
import { randomBytes } from "node:crypto";
import type { WaitlistStatus } from "@/generated/prisma/enums";
import { audit } from "./audit";
import { findHardConflicts } from "./availability";
import { ACTIVE_STATUSES } from "./availability-data";
import { db } from "./db";
import { cancelQueuedNotifications, enqueueAppointmentNotification, enqueueWaitlistJoined } from "./notifications";
import type { Actor } from "./permissions";
import { partsInTz } from "./time";
import { matchesSlot, sortWaitlist, type WaitlistPrefs } from "./waitlist-match";
import { notifyProfessional } from "./pro-notify";

/**
 * Lista de espera.
 *
 * Ciclo: WAITING → (oferta) OFFERED → BOOKED | WAITING (recusou/expirou) | REMOVED.
 *
 * A oferta é um Appointment AWAITING_CONFIRMATION com source WAITLIST: reserva
 * o horário, ganha token, expira pelo mesmo cron dos pedidos públicos e é
 * confirmada/recusada pelo mesmo /confirmar/[token]. Esta camada só mantém o
 * vínculo entrada ↔ agendamento e reage ao que acontece com ele.
 */

export const ACTIVE_WAITLIST: WaitlistStatus[] = ["WAITING", "OFFERED"];

export type JoinInput = {
  organizationId: string;
  professionalId: string;
  patientId: string;
  serviceId: string | null;
  prefs: WaitlistPrefs;
  note: string | null;
  source: "PUBLIC_PAGE" | "MANUAL";
};

/**
 * Entra (ou atualiza as preferências, se já está) na lista de um
 * profissional. Uma entrada ativa por (paciente, profissional).
 */
export async function joinWaitlist(input: JoinInput): Promise<{ id: string; created: boolean }> {
  const existing = await db.waitlistEntry.findFirst({
    where: { professionalId: input.professionalId, patientId: input.patientId, status: { in: ACTIVE_WAITLIST } },
    select: { id: true, status: true },
  });
  const data = { serviceId: input.serviceId, modality: input.prefs.modality, weekdays: input.prefs.weekdays, periods: input.prefs.periods, note: input.note };
  if (existing) {
    await db.waitlistEntry.update({ where: { id: existing.id }, data });
    return { id: existing.id, created: false };
  }
  const e = await db.waitlistEntry.create({
    data: { organizationId: input.organizationId, professionalId: input.professionalId, patientId: input.patientId, source: input.source, ...data },
    select: { id: true },
  });
  return { id: e.id, created: true };
}

/** Entradas ativas de um profissional, já na ordem de oferta. */
export async function listWaitlist(professionalId: string) {
  const rows = await db.waitlistEntry.findMany({
    where: { professionalId, status: { in: ACTIVE_WAITLIST } },
    select: {
      id: true,
      status: true,
      modality: true,
      weekdays: true,
      periods: true,
      note: true,
      source: true,
      priority: true,
      offersCount: true,
      offeredAt: true,
      createdAt: true,
      patient: { select: { id: true, name: true, whatsapp: true } },
      service: { select: { id: true, name: true, durationMinutes: true } },
      offeredAppointment: { select: { id: true, startsAt: true, status: true } },
    },
  });
  return sortWaitlist(rows);
}

/** Quem, na lista do profissional, combina com um horário que vagou. */
export async function candidatesForSlot(professionalId: string, slot: { startsAt: Date; modality: "IN_PERSON" | "ONLINE" }, tz: string) {
  const p = partsInTz(slot.startsAt, tz);
  const facts = { modality: slot.modality, weekday: p.weekday, hour: p.hour };
  const waiting = (await listWaitlist(professionalId)).filter((e) => e.status === "WAITING");
  return waiting.filter((e) => matchesSlot({ modality: e.modality === "HYBRID" ? null : e.modality, weekdays: e.weekdays, periods: e.periods }, facts));
}

export class WaitlistError extends Error {}

/**
 * Oferece um horário concreto: cria o agendamento pendente (reserva) e
 * envia a mensagem com o link. Conflitos duros (sessão ativa, bloqueio)
 * impedem; a grade semanal não — quem oferece é o profissional, que sabe.
 */
export async function offerSlot(
  actor: Actor | null,
  entryId: string,
  slot: { startsAt: Date; modality: "IN_PERSON" | "ONLINE" },
): Promise<{ appointmentId: string }> {
  const entry = await db.waitlistEntry.findUnique({
    where: { id: entryId },
    select: {
      id: true,
      status: true,
      organizationId: true,
      professionalId: true,
      patientId: true,
      serviceId: true,
      service: { select: { id: true, isActive: true, durationMinutes: true, name: true, priceCents: true, modality: true } },
      professional: { select: { services: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, durationMinutes: true, name: true, priceCents: true, modality: true } } } },
      patient: { select: { deletedAt: true } },
    },
  });
  if (!entry) throw new WaitlistError("Entrada não encontrada");
  if (entry.status !== "WAITING") throw new WaitlistError("Esta pessoa já tem uma oferta em aberto ou saiu da lista");
  if (entry.patient.deletedAt) throw new WaitlistError("Cadastro do paciente excluído");
  if (slot.startsAt <= new Date()) throw new WaitlistError("O horário precisa ser no futuro");

  // Serviço: o escolhido na entrada, se ativo e compatível; senão o primeiro
  // ativo que aceite a modalidade do horário (a pessoa disse "tanto faz").
  const fits = (m: "IN_PERSON" | "ONLINE" | "HYBRID") => m === "HYBRID" || m === slot.modality;
  const service = entry.service?.isActive ? entry.service : entry.professional.services.find((sv) => fits(sv.modality));
  if (!service) throw new WaitlistError("O profissional não tem serviço ativo nesta modalidade");
  if (!fits(service.modality)) throw new WaitlistError("Modalidade incompatível com o serviço escolhido pela pessoa");

  const endsAt = new Date(slot.startsAt.getTime() + service.durationMinutes * 60_000);

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${entry.professionalId}))`;
    const [appts, blocks] = await Promise.all([
      tx.appointment.findMany({
        where: { professionalId: entry.professionalId, status: { in: [...ACTIVE_STATUSES] }, startsAt: { lt: endsAt }, endsAt: { gt: slot.startsAt } },
        select: { id: true, startsAt: true, endsAt: true },
      }),
      tx.scheduleBlock.findMany({ where: { professionalId: entry.professionalId, startsAt: { lt: endsAt }, endsAt: { gt: slot.startsAt } }, select: { startsAt: true, endsAt: true } }),
    ]);
    const c = findHardConflicts(
      { start: slot.startsAt, end: endsAt },
      appts.map((a) => ({ id: a.id, start: a.startsAt, end: a.endsAt })),
      blocks.map((b) => ({ start: b.startsAt, end: b.endsAt })),
    );
    if (c.appointments.length > 0 || c.blocks.length > 0) return { conflict: true as const };

    const a = await tx.appointment.create({
      data: {
        organizationId: entry.organizationId,
        professionalId: entry.professionalId,
        patientId: entry.patientId,
        serviceId: service.id,
        startsAt: slot.startsAt,
        endsAt,
        modality: slot.modality,
        status: "AWAITING_CONFIRMATION",
        source: "WAITLIST",
        serviceNameSnapshot: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        confirmationToken: randomBytes(24).toString("base64url"),
      },
      select: { id: true },
    });
    await tx.waitlistEntry.update({
      where: { id: entry.id },
      data: { status: "OFFERED", offeredAppointmentId: a.id, offeredAt: new Date(), offersCount: { increment: 1 } },
    });
    return { conflict: false as const, appointmentId: a.id };
  });
  if (result.conflict) throw new WaitlistError("Esse horário já está ocupado (sessão ativa ou bloqueio)");

  await audit(actor, { organizationId: entry.organizationId, action: "waitlist.offer", entityType: "WaitlistEntry", entityId: entry.id, after: { appointmentId: result.appointmentId, startsAt: slot.startsAt } });
  await enqueueAppointmentNotification(result.appointmentId, "WAITLIST_OFFER");
  return { appointmentId: result.appointmentId };
}

/**
 * Reflete no vínculo o que aconteceu com o agendamento oferecido:
 * confirmado → BOOKED; cancelado/expirado → volta a WAITING (a pessoa não
 * saiu da lista; só não ficou com aquele horário). Idempotente.
 */
export async function syncWaitlistForAppointment(appointmentId: string): Promise<void> {
  const entry = await db.waitlistEntry.findUnique({
    where: { offeredAppointmentId: appointmentId },
    select: { id: true, status: true, organizationId: true, offeredAppointment: { select: { status: true } } },
  });
  if (!entry || entry.status !== "OFFERED" || !entry.offeredAppointment) return;
  const s = entry.offeredAppointment.status;
  if (s === "CONFIRMED" || s === "COMPLETED" || s === "AWAITING_PAYMENT" || s === "NO_SHOW") {
    await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: "BOOKED", resolvedAt: new Date() } });
    await audit(null, { organizationId: entry.organizationId, action: "waitlist.booked", entityType: "WaitlistEntry", entityId: entry.id, after: { appointmentId } });
    await notifyProfessional({ event: "WAITLIST_OFFER_ANSWERED", waitlistEntryId: entry.id, appointmentId, accepted: true });
  } else if (s === "CANCELLED_BY_PATIENT" || s === "CANCELLED_BY_PROFESSIONAL" || s === "EXPIRED") {
    await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: "WAITING", offeredAppointmentId: null, offeredAt: null } });
    await audit(null, { organizationId: entry.organizationId, action: "waitlist.offer_declined", entityType: "WaitlistEntry", entityId: entry.id, after: { appointmentId, appointmentStatus: s } });
    if (s !== "CANCELLED_BY_PROFESSIONAL") await notifyProfessional({ event: "WAITLIST_OFFER_ANSWERED", waitlistEntryId: entry.id, appointmentId, accepted: false });
  }
}

/** Varredura do cron: pega qualquer oferta cujo agendamento mudou sem passar pelo sync. */
export async function syncWaitlistOffers(): Promise<number> {
  const stale = await db.waitlistEntry.findMany({
    where: { status: "OFFERED", offeredAppointment: { status: { notIn: ["AWAITING_CONFIRMATION", "PENDING"] } } },
    select: { offeredAppointmentId: true },
  });
  for (const e of stale) if (e.offeredAppointmentId) await syncWaitlistForAppointment(e.offeredAppointmentId);
  return stale.length;
}

/** Sai da lista. Se havia oferta em aberto, o horário reservado é liberado. */
export async function removeFromWaitlist(actor: Actor | null, entryId: string, reason: string): Promise<void> {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId }, select: { id: true, status: true, organizationId: true, offeredAppointmentId: true } });
  if (!entry || !ACTIVE_WAITLIST.includes(entry.status)) throw new WaitlistError("Entrada não encontrada");
  await db.waitlistEntry.update({ where: { id: entry.id }, data: { status: "REMOVED", removedReason: reason, resolvedAt: new Date() } });
  if (entry.offeredAppointmentId) {
    const r = await db.appointment.updateMany({
      where: { id: entry.offeredAppointmentId, status: "AWAITING_CONFIRMATION" },
      data: { status: "CANCELLED_BY_PROFESSIONAL", cancelledAt: new Date(), cancelReason: "Oferta da lista de espera retirada" },
    });
    if (r.count > 0) await cancelQueuedNotifications(entry.offeredAppointmentId);
  }
  await audit(actor, { organizationId: entry.organizationId, action: "waitlist.remove", entityType: "WaitlistEntry", entityId: entry.id, after: { reason } });
}

export async function setWaitlistPriority(actor: Actor, entryId: string, priority: boolean): Promise<void> {
  const r = await db.waitlistEntry.updateMany({ where: { id: entryId, organizationId: actor.organizationId, status: { in: ACTIVE_WAITLIST } }, data: { priority } });
  if (r.count === 0) throw new WaitlistError("Entrada não encontrada");
  await audit(actor, { organizationId: actor.organizationId, action: "waitlist.priority", entityType: "WaitlistEntry", entityId: entryId, after: { priority } });
}

/** Quantos aguardam (para o contador da agenda). */
export async function countWaiting(professionalId: string | null, organizationId: string): Promise<number> {
  return db.waitlistEntry.count({ where: { organizationId, ...(professionalId ? { professionalId } : {}), status: { in: ACTIVE_WAITLIST } } });
}

export { enqueueWaitlistJoined };
