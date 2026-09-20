import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { enqueueReactivation, enqueueSurvey } from "@/lib/notifications";
import type { Actor } from "@/lib/permissions";
import { canManageSchedule } from "@/lib/permissions";
import { reactivationCandidates } from "./rules";

/**
 * Pesquisa de experiência (§29) e reativação (§28) — administrativas; nada aqui lê dado clínico.
 */

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const SURVEY_DELAY_MS = 24 * 3_600_000;
export const SURVEY_TTL_DAYS = 14;

/** Chamado ao concluir a sessão: cria a pesquisa (uma por sessão) e agenda o envio para 24 h depois. Nunca lança. */
export async function scheduleSurveyForAppointment(appointmentId: string): Promise<void> {
  try {
    const a = await db.appointment.findUnique({
      where: { id: appointmentId },
      select: { id: true, organizationId: true, professionalId: true, patientId: true, status: true, experienceSurvey: { select: { id: true } }, professional: { select: { policy: { select: { surveyEnabled: true } } } }, patient: { select: { deletedAt: true, commsPrefs: true } } },
    });
    if (!a || a.status !== "COMPLETED" || a.experienceSurvey || !a.professional.policy?.surveyEnabled || a.patient.deletedAt) return;
    const token = randomBytes(32).toString("base64url");
    const s = await db.experienceSurvey.create({ data: { organizationId: a.organizationId, professionalId: a.professionalId, patientId: a.patientId, appointmentId: a.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + SURVEY_TTL_DAYS * 86_400_000) } });
    await enqueueSurvey(s.id, token, new Date(Date.now() + SURVEY_DELAY_MS));
  } catch (e) {
    console.error("[survey] falha ao agendar pesquisa", appointmentId, e);
  }
}

export async function loadSurveyByToken(token: string) {
  const s = await db.experienceSurvey.findUnique({ where: { tokenHash: hash(token) }, select: { id: true, answeredAt: true, expiresAt: true, professional: { select: { displayName: true, organization: { select: { name: true, type: true } } } }, patient: { select: { name: true } } } });
  if (!s) return null;
  return { ...s, expired: !s.answeredAt && s.expiresAt < new Date() };
}

export async function answerSurvey(token: string, score: number, comment: string | null): Promise<boolean> {
  const r = await db.experienceSurvey.updateMany({ where: { tokenHash: hash(token), answeredAt: null, expiresAt: { gt: new Date() } }, data: { score, comment, answeredAt: new Date() } });
  return r.count > 0;
}

export async function surveyResults(actor: Actor, professionalId: string, range: { from: Date; to: Date }) {
  return db.experienceSurvey.findMany({
    where: { organizationId: actor.organizationId, professionalId, answeredAt: { gte: range.from, lt: range.to } },
    orderBy: { answeredAt: "desc" },
    select: { id: true, score: true, comment: true, answeredAt: true, patient: { select: { name: true } } },
  });
}

// ── Reativação ──────────────────────────────────────────────────────────────

/** Profissional precisa ser do tenant: `canManageSchedule` é por papel e o id vem do cliente. */
async function professionalInTenant(actor: Actor, professionalId: string) {
  return db.professional.findFirst({ where: { id: professionalId, organizationId: actor.organizationId }, select: { id: true } });
}

export async function listReactivation(actor: Actor, professionalId: string, now = new Date()) {
  if (!(await professionalInTenant(actor, professionalId))) return { afterDays: 90, inviteText: null, candidates: [] };
  const policy = await db.professionalPolicy.findUnique({ where: { professionalId }, select: { reactivationAfterDays: true, reactivationInviteText: true } });
  const afterDays = policy?.reactivationAfterDays ?? 90;
  const rows = await db.patient.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null, anonymizedAt: null, followUpStatus: "ACTIVE", appointments: { some: { professionalId } } },
    select: {
      id: true, name: true, whatsapp: true, createdAt: true, followUpStatus: true, lastCompletedAt: true, deletedAt: true,
      appointments: { where: { professionalId, startsAt: { gt: now }, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"] } }, select: { id: true }, take: 1 },
      reactivationContacts: { where: { professionalId }, orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } },
    },
  });
  const candidates = reactivationCandidates(rows.map((p) => ({ ...p, hasFutureAppointment: p.appointments.length > 0, lastContactAt: p.reactivationContacts[0]?.sentAt ?? null })), now, afterDays);
  return { afterDays, inviteText: policy?.reactivationInviteText ?? null, candidates: candidates.map((p) => ({ id: p.id, name: p.name, lastCompletedAt: p.lastCompletedAt, createdAt: p.createdAt, lastContactAt: p.lastContactAt })) };
}

/** Envia o convite de retorno (heeca_retorno) — sempre por clique humano. */
export async function sendReactivation(actor: Actor, professionalId: string, patientId: string): Promise<void> {
  if (!canManageSchedule(actor, professionalId)) throw new Error("Sem permissão");
  if (!(await professionalInTenant(actor, professionalId))) throw new Error("Profissional não encontrado");
  const patient = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new Error("Paciente não encontrado");
  const n = await enqueueReactivation(patient.id, professionalId);
  const c = await db.reactivationContact.create({ data: { organizationId: actor.organizationId, professionalId, patientId: patient.id, notificationId: n.id, byUserId: actor.userId } });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.reactivation_sent", entityType: "Patient", entityId: patient.id, after: { contactId: c.id } });
}
