import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { audit } from "@/lib/audit";
import { loadAvailabilityInput } from "@/lib/availability-data";
import { computeAvailableDays, computeAvailableSlots, isSlotAvailable, todayCivil, addDaysCivil } from "@/lib/availability";
import { db } from "@/lib/db";
import { cancelQueuedNotifications, enqueueAppointmentNotification, enqueuePortalLogin, scheduleReminder } from "@/lib/notifications";
import { balance, effectiveStatus } from "@/lib/packages/rules";
import { notifyProfessional } from "@/lib/pro-notify";
import { clientIp } from "@/lib/rate-limit";
import { syncWaitlistForAppointment } from "@/lib/waitlist";

/**
 * Portal do paciente (§17; D4 = link mágico por WhatsApp; docs/mind/03-FLUXOS.md F9).
 *
 * Identidade = (organizationId, whatsapp), a mesma do cadastro. O link prova a posse do número.
 * A sessão é própria (cookie `hm_patient`), nunca uma sessão do Auth.js: o paciente não é User,
 * não tem papel e nunca alcança nada além dos próprios dados administrativos. Nada clínico aqui.
 *
 * O portal é acessado pelo slug do profissional (mind.heeca.com.br/portal/<slug>) — é isso que dá o
 * tenant. A sessão vale para a organização inteira (clínica com vários profissionais).
 */

export const PORTAL_COOKIE = "hm_patient";
export const TOKEN_TTL_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 86_400_000;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export class PortalError extends Error {}

// ── Entrada ─────────────────────────────────────────────────────────────────

export async function professionalBySlug(slug: string) {
  return db.professional.findUnique({ where: { slug }, select: { id: true, organizationId: true, displayName: true, isActive: true, organization: { select: { name: true, timezone: true, type: true } } } });
}

/**
 * Pede o link. Resposta sempre neutra (não revela se o número existe). Paciente excluído não recebe.
 */
export async function requestAccess(organizationId: string, whatsapp: string): Promise<void> {
  const patient = await db.patient.findFirst({ where: { organizationId, whatsapp, deletedAt: null, anonymizedAt: null }, select: { id: true } });
  if (!patient) return;
  const token = randomBytes(32).toString("base64url");
  await db.patientAccessToken.create({ data: { organizationId, patientId: patient.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TOKEN_TTL_MS), requestIp: await clientIp() } });
  await enqueuePortalLogin(patient.id, token);
  await audit(null, { organizationId, action: "portal.access_requested", entityType: "Patient", entityId: patient.id });
}

/** Troca o token (uso único) por uma sessão e grava o cookie. Devolve o slug para redirecionar. */
export async function redeemToken(token: string, userAgent: string | null): Promise<{ organizationId: string; patientId: string } | null> {
  const t = await db.patientAccessToken.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, organizationId: true, patientId: true, expiresAt: true, usedAt: true } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return null;
  const claimed = await db.patientAccessToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) return null;
  const sid = randomUUID();
  await db.patientSession.create({ data: { organizationId: t.organizationId, patientId: t.patientId, sid, expiresAt: new Date(Date.now() + SESSION_TTL_MS), userAgent: userAgent?.slice(0, 300) ?? null } });
  (await cookies()).set(PORTAL_COOKIE, sid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/portal", maxAge: SESSION_TTL_MS / 1000 });
  await audit(null, { organizationId: t.organizationId, action: "portal.login", entityType: "Patient", entityId: t.patientId });
  return { organizationId: t.organizationId, patientId: t.patientId };
}

export type PortalActor = { sessionId: string; organizationId: string; patientId: string; patientName: string };

/** Sessão do cookie, se válida e da organização do slug. Toca lastSeenAt no máximo a cada 5 min. */
export async function getPortalActor(organizationId: string): Promise<PortalActor | null> {
  const sid = (await cookies()).get(PORTAL_COOKIE)?.value;
  if (!sid) return null;
  const s = await db.patientSession.findUnique({ where: { sid }, select: { id: true, organizationId: true, patientId: true, expiresAt: true, revokedAt: true, lastSeenAt: true, patient: { select: { name: true, deletedAt: true, anonymizedAt: true } } } });
  if (!s || s.revokedAt || s.expiresAt < new Date() || s.organizationId !== organizationId || s.patient.deletedAt || s.patient.anonymizedAt) return null;
  if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) await db.patientSession.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  return { sessionId: s.id, organizationId: s.organizationId, patientId: s.patientId, patientName: s.patient.name };
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(PORTAL_COOKIE)?.value;
  if (sid) await db.patientSession.updateMany({ where: { sid, revokedAt: null }, data: { revokedAt: new Date() } });
  jar.delete({ name: PORTAL_COOKIE, path: "/portal" });
}

/** Recepção/profissional encerra todas as sessões do portal de um paciente. */
export async function revokePatientSessions(patientId: string): Promise<number> {
  const r = await db.patientSession.updateMany({ where: { patientId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count;
}

/** Cron: tokens vencidos e sessões vencidas/revogadas há mais de 30 dias. */
export async function purgePortal(): Promise<{ tokens: number; sessions: number }> {
  const old = new Date(Date.now() - 30 * 86_400_000);
  const [t, s] = await Promise.all([
    db.patientAccessToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } }),
    db.patientSession.deleteMany({ where: { OR: [{ expiresAt: { lt: old } }, { revokedAt: { lt: old } }] } }),
  ]);
  return { tokens: t.count, sessions: s.count };
}

// ── Leitura ─────────────────────────────────────────────────────────────────

export async function portalHome(actor: PortalActor, now = new Date()) {
  const [upcoming, pendingPayments, purchases, documents] = await Promise.all([
    db.appointment.findMany({
      where: { organizationId: actor.organizationId, patientId: actor.patientId, startsAt: { gt: new Date(now.getTime() - 2 * 3_600_000) }, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED", "IN_PROGRESS"] } },
      orderBy: { startsAt: "asc" },
      take: 10,
      select: { id: true, startsAt: true, endsAt: true, status: true, modality: true, serviceNameSnapshot: true, onlineLink: true, priceCents: true, paymentStatus: true, confirmationToken: true, professional: { select: { displayName: true, onlineFixedLink: true, scheduleSettings: { select: { minCancelHours: true, minRescheduleHours: true } } } } },
    }),
    db.appointment.findMany({
      where: { organizationId: actor.organizationId, patientId: actor.patientId, status: "COMPLETED", paymentStatus: "PENDING" },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: { id: true, startsAt: true, serviceNameSnapshot: true, priceCents: true, professional: { select: { displayName: true, policy: { select: { paymentInfo: true } } } } },
    }),
    db.packagePurchase.findMany({
      where: { organizationId: actor.organizationId, patientId: actor.patientId, status: { in: ["ACTIVE", "EXHAUSTED", "EXPIRED"] } },
      orderBy: { purchasedAt: "desc" },
      take: 10,
      include: { consumptions: { select: { revertedAt: true } } },
    }),
    db.documentRequest.findMany({
      where: { organizationId: actor.organizationId, patientId: actor.patientId, status: { in: ["PENDING", "VIEWED", "ACCEPTED"] } },
      orderBy: { sentAt: "desc" },
      take: 20,
      select: { id: true, titleSnapshot: true, kind: true, status: true, sentAt: true, acceptedAt: true, expiresAt: true, templateVersion: true },
    }),
  ]);
  return {
    upcoming,
    pendingPayments,
    purchases: purchases.map((p) => ({ id: p.id, name: p.nameSnapshot, total: p.sessionsTotal, balance: balance(p, p.consumptions), status: effectiveStatus(p, p.consumptions, now), expiresAt: p.expiresAt, paymentStatus: p.paymentStatus, priceCents: p.priceCents })),
    documents,
  };
}

export async function portalAppointment(actor: PortalActor, appointmentId: string) {
  return db.appointment.findFirst({
    where: { id: appointmentId, organizationId: actor.organizationId, patientId: actor.patientId },
    select: { id: true, startsAt: true, endsAt: true, status: true, modality: true, serviceNameSnapshot: true, durationMinutes: true, onlineLink: true, professionalId: true, professional: { select: { displayName: true, onlineFixedLink: true, scheduleSettings: { select: { minCancelHours: true, minRescheduleHours: true } }, policy: { select: { cancellationPolicy: true, reschedulePolicy: true, onlineInstructions: true } } } } },
  });
}

/** O paciente pode mexer nesta sessão? (ativa e dentro do prazo da política) */
export function patientCanChange(a: { status: string; startsAt: Date }, minHours: number, now = new Date()): { ok: boolean; reason?: string } {
  if (!["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"].includes(a.status)) return { ok: false, reason: "Esta sessão não pode mais ser alterada por aqui." };
  if (now.getTime() > a.startsAt.getTime() - minHours * 3_600_000) return { ok: false, reason: `O prazo para alterar por aqui (${minHours}h antes) já passou. Fale com o profissional.` };
  return { ok: true };
}

// ── Ações ───────────────────────────────────────────────────────────────────

export async function cancelFromPortal(actor: PortalActor, appointmentId: string): Promise<void> {
  const a = await portalAppointment(actor, appointmentId);
  if (!a) throw new PortalError("Sessão não encontrada.");
  const check = patientCanChange(a, a.professional.scheduleSettings?.minCancelHours ?? 24);
  if (!check.ok) throw new PortalError(check.reason!);
  await db.appointment.update({ where: { id: a.id }, data: { status: "CANCELLED_BY_PATIENT", cancelledAt: new Date(), cancelReason: "Cancelado pelo paciente pelo portal" } });
  await audit(null, { organizationId: actor.organizationId, action: "appointment.cancel_by_patient", entityType: "Appointment", entityId: a.id, after: { by: "portal" } });
  await cancelQueuedNotifications(a.id);
  await enqueueAppointmentNotification(a.id, "CANCELLATION");
  await syncWaitlistForAppointment(a.id);
  await notifyProfessional({ event: "BOOKING_CANCELLED", appointmentId: a.id, by: "link" });
}

/** Dias e horários livres para reagendar (grade + buffer + antecedência, como a página pública). */
export async function rescheduleOptions(actor: PortalActor, appointmentId: string, dateISO?: string) {
  const a = await portalAppointment(actor, appointmentId);
  if (!a) return null;
  const tz = (await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } })).timezone;
  const from = todayCivil(new Date(), tz);
  const to = addDaysCivil(from, 30);
  const input = await loadAvailabilityInput({ professionalId: a.professionalId, fromISO: from, toISO: to, durationMinutes: a.durationMinutes, excludeAppointmentId: a.id });
  const days = computeAvailableDays(input, from, to);
  const day = dateISO && days.includes(dateISO) ? dateISO : days[0];
  const slots = day ? computeAvailableSlots(input, day) : [];
  return { appointment: a, tz, days, day, slots };
}

export async function rescheduleFromPortal(actor: PortalActor, appointmentId: string, start: Date): Promise<void> {
  const a = await portalAppointment(actor, appointmentId);
  if (!a) throw new PortalError("Sessão não encontrada.");
  const check = patientCanChange(a, a.professional.scheduleSettings?.minRescheduleHours ?? 24);
  if (!check.ok) throw new PortalError(check.reason!);
  const tz = (await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } })).timezone;
  const from = todayCivil(new Date(), tz);
  const input = await loadAvailabilityInput({ professionalId: a.professionalId, fromISO: from, toISO: addDaysCivil(from, 31), durationMinutes: a.durationMinutes, excludeAppointmentId: a.id });
  if (!isSlotAvailable(input, start)) throw new PortalError("Esse horário não está mais disponível. Escolha outro.");
  const end = new Date(start.getTime() + a.durationMinutes * 60_000);
  await db.appointment.update({ where: { id: a.id }, data: { startsAt: start, endsAt: end, status: "CONFIRMED", confirmedAt: new Date() } });
  await audit(null, { organizationId: actor.organizationId, action: "appointment.reschedule", entityType: "Appointment", entityId: a.id, before: { startsAt: a.startsAt }, after: { startsAt: start, by: "portal" } });
  await cancelQueuedNotifications(a.id);
  await enqueueAppointmentNotification(a.id, "RESCHEDULE");
  await scheduleReminder(a.id, start);
  await notifyProfessional({ event: "BOOKING_CONFIRMED", appointmentId: a.id, by: "link" });
}

/** Abre um documento pendente pelo portal: gira o token (o anterior, da mensagem, deixa de valer) e devolve o novo. */
export async function openDocumentFromPortal(actor: PortalActor, requestId: string): Promise<string | null> {
  const r = await db.documentRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId, patientId: actor.patientId, status: { in: ["PENDING", "VIEWED"] }, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (!r) return null;
  const token = randomBytes(32).toString("base64url");
  await db.documentRequest.update({ where: { id: r.id }, data: { tokenHash: hash(token) } });
  return token;
}

export async function acceptedDocumentForPortal(actor: PortalActor, requestId: string) {
  return db.documentRequest.findFirst({
    where: { id: requestId, organizationId: actor.organizationId, patientId: actor.patientId, status: "ACCEPTED" },
    select: { id: true, titleSnapshot: true, bodySnapshot: true, bodyHash: true, acceptedAt: true, acceptName: true, templateVersion: true, professional: { select: { displayName: true, organization: { select: { name: true, timezone: true } } } } },
  });
}
