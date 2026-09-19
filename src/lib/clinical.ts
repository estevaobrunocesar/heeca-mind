import "server-only";
import type { ClinicalNoteKind } from "@/generated/prisma/enums";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { canAccessClinicalData, type Actor } from "./permissions";
import { clientIp } from "./rate-limit";

/**
 * Prontuário: único ponto de acesso às notas clínicas.
 *
 * Invariantes:
 *  - Toda função verifica canAccessClinicalData ANTES de decifrar qualquer coisa.
 *  - Toda leitura/escrita/exclusão/impressão gera ClinicalAccessLog.
 *  - Conteúdo só existe em claro dentro destas funções e na resposta ao
 *    profissional autorizado; nunca vai para logs, auditoria ou notificações.
 *  - Notas são imutáveis; exclusão é lógica com motivo.
 */

export class ClinicalAccessDenied extends Error {
  constructor() {
    super("Acesso ao prontuário não permitido");
    this.name = "ClinicalAccessDenied";
  }
}

export type ClinicalNoteView = {
  id: string;
  kind: ClinicalNoteKind;
  content: string;
  createdAt: Date;
  authorName: string;
  appointment: { id: string; startsAt: Date; serviceNameSnapshot: string } | null;
};

export const KIND_LABEL: Record<ClinicalNoteKind, string> = {
  EVOLUTION: "Evolução de sessão",
  NOTE: "Anotação",
  ASSESSMENT: "Avaliação",
};

async function logAccess(noteIds: string[], userId: string, action: "READ" | "WRITE" | "DELETE" | "EXPORT") {
  if (noteIds.length === 0) return;
  const ip = await clientIp();
  await db.clinicalAccessLog.createMany({ data: noteIds.map((clinicalNoteId) => ({ clinicalNoteId, userId, action, ip })) });
}

/**
 * "Responsável" é um fato do banco, não do papel: o profissional do ator
 * precisa ter (ou ter tido) sessão com o paciente — pendente, confirmada,
 * concluída ou falta. Sessões só canceladas/expiradas não estabelecem
 * relação clínica.
 */
export async function isTreatingProfessional(professionalId: string, patientId: string): Promise<boolean> {
  const a = await db.appointment.findFirst({
    where: {
      professionalId,
      patientId,
      status: { in: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED", "AWAITING_PAYMENT", "COMPLETED", "NO_SHOW"] },
    },
    select: { id: true },
  });
  return !!a;
}

/**
 * Garante que o ator pode abrir o prontuário deste paciente; devolve o
 * professionalId. Regra pura (canAccessClinicalData) + fato do banco
 * (isTreatingProfessional).
 */
export async function requireClinicalAccess(actor: Actor, patientId: string): Promise<string> {
  const pid = actor.professionalId;
  if (!pid || !canAccessClinicalData(actor, pid)) throw new ClinicalAccessDenied();
  if (!(await isTreatingProfessional(pid, patientId))) throw new ClinicalAccessDenied();
  return pid;
}

/** Versão booleana para páginas decidirem o que renderizar. */
export async function canOpenClinicalRecord(actor: Actor, patientId: string): Promise<boolean> {
  try {
    await requireClinicalAccess(actor, patientId);
    return true;
  } catch {
    return false;
  }
}

/** Notas do paciente escritas pelo profissional do ator. Registra READ de cada uma. */
export async function listNotes(actor: Actor, patientId: string): Promise<ClinicalNoteView[]> {
  const professionalId = await requireClinicalAccess(actor, patientId);
  const rows = await db.clinicalNote.findMany({
    where: { patientId, professionalId, deletedAt: null, patient: { organizationId: actor.organizationId } },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      appointment: { select: { id: true, startsAt: true, serviceNameSnapshot: true } },
    },
  });
  await logAccess(rows.map((r) => r.id), actor.userId, "READ");
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    content: decrypt(r.contentEnc),
    createdAt: r.createdAt,
    authorName: r.author.name,
    appointment: r.appointment,
  }));
}

export async function createNote(
  actor: Actor,
  input: { patientId: string; kind: ClinicalNoteKind; content: string; appointmentId: string | null },
): Promise<string> {
  const professionalId = await requireClinicalAccess(actor, input.patientId);

  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new Error("Paciente não encontrado");

  if (input.appointmentId) {
    // A sessão precisa ser deste paciente com este profissional.
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: input.patientId, professionalId }, select: { id: true } });
    if (!a) throw new Error("Sessão inválida para esta evolução");
  }

  const note = await db.clinicalNote.create({
    data: {
      patientId: input.patientId,
      professionalId,
      authorUserId: actor.userId,
      appointmentId: input.appointmentId,
      kind: input.kind,
      contentEnc: encrypt(input.content),
    },
    select: { id: true },
  });
  await logAccess([note.id], actor.userId, "WRITE");
  return note.id;
}

/** Exclusão lógica com motivo. O conteúdo permanece cifrado até a anonimização (dever de guarda). */
export async function deleteNote(actor: Actor, noteId: string, reason: string): Promise<void> {
  const note = await db.clinicalNote.findUnique({ where: { id: noteId }, select: { patientId: true } });
  if (!note) throw new Error("Nota não encontrada");
  const professionalId = await requireClinicalAccess(actor, note.patientId);
  const r = await db.clinicalNote.updateMany({
    where: { id: noteId, professionalId, deletedAt: null },
    data: { deletedAt: new Date(), deletedReason: reason },
  });
  if (r.count === 0) throw new Error("Nota não encontrada");
  await logAccess([noteId], actor.userId, "DELETE");
}

/** Marca uma exportação/impressão (o conteúdo saiu do sistema). */
export async function logExport(actor: Actor, noteIds: string[]) {
  await logAccess(noteIds, actor.userId, "EXPORT");
}

/** Últimos acessos ao prontuário deste paciente (transparência para o profissional). */
export async function recentAccess(actor: Actor, patientId: string, take = 20) {
  const professionalId = await requireClinicalAccess(actor, patientId);
  const rows = await db.clinicalAccessLog.findMany({
    where: { clinicalNote: { patientId, professionalId } },
    orderBy: { createdAt: "desc" },
    take,
    select: { action: true, createdAt: true, ip: true, userId: true },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: name.get(r.userId) ?? "?" }));
}

/** Sessões deste profissional com o paciente que ainda não têm evolução — para o formulário. */
export async function sessionsWithoutEvolution(actor: Actor, patientId: string) {
  const professionalId = await requireClinicalAccess(actor, patientId);
  return db.appointment.findMany({
    where: {
      patientId,
      professionalId,
      status: { in: ["COMPLETED", "CONFIRMED"] },
      startsAt: { lte: new Date() },
      clinicalNotes: { none: { kind: "EVOLUTION", deletedAt: null } },
    },
    orderBy: { startsAt: "desc" },
    take: 20,
    select: { id: true, startsAt: true, serviceNameSnapshot: true },
  });
}
