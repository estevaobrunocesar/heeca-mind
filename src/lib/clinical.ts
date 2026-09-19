import "server-only";
import { randomUUID } from "node:crypto";
import type { ClinicalDocumentKind, ClinicalNoteKind } from "@/generated/prisma/enums";
import { decrypt, decryptBytes, encrypt, encryptBytes } from "./crypto";
import { db } from "./db";
import { DOCUMENT_EXT, DOCUMENT_MIME, MAX_DOCUMENT_BYTES, safeFileName, sniffDocument } from "./document";
import { canAccessClinicalData, type Actor } from "./permissions";
import { clientIp } from "./rate-limit";
import { getStorage } from "./storage";

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

type AccessAction = "READ" | "WRITE" | "DELETE" | "EXPORT";

async function logAccess(noteIds: string[], userId: string, action: AccessAction) {
  if (noteIds.length === 0) return;
  const ip = await clientIp();
  await db.clinicalAccessLog.createMany({ data: noteIds.map((clinicalNoteId) => ({ clinicalNoteId, userId, action, ip })) });
}

async function logDocumentAccess(documentIds: string[], userId: string, action: AccessAction) {
  if (documentIds.length === 0) return;
  const ip = await clientIp();
  await db.clinicalAccessLog.createMany({ data: documentIds.map((clinicalDocumentId) => ({ clinicalDocumentId, userId, action, ip })) });
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
    where: { OR: [{ clinicalNote: { patientId, professionalId } }, { clinicalDocument: { patientId, professionalId } }] },
    orderBy: { createdAt: "desc" },
    take,
    select: { action: true, createdAt: true, ip: true, userId: true },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: name.get(r.userId) ?? "?" }));
}

/** Sessões realizadas deste profissional com o paciente — para vincular um documento. */
export async function treatedSessions(actor: Actor, patientId: string) {
  const professionalId = await requireClinicalAccess(actor, patientId);
  return db.appointment.findMany({
    where: { patientId, professionalId, status: { in: ["COMPLETED", "CONFIRMED", "NO_SHOW"] }, startsAt: { lte: new Date() } },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: { id: true, startsAt: true, serviceNameSnapshot: true },
  });
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

// ───────────────────────────────────────────────────────────────
// Documentos (anexos): laudos, encaminhamentos, declarações, termos, exames
// ───────────────────────────────────────────────────────────────

export const DOCUMENT_KIND_LABEL: Record<ClinicalDocumentKind, string> = {
  REPORT: "Laudo / relatório",
  REFERRAL: "Encaminhamento",
  DECLARATION: "Declaração",
  CERTIFICATE: "Atestado",
  CONSENT: "Termo de consentimento",
  EXAM: "Exame / documento externo",
  OTHER: "Outro",
};

export type ClinicalDocumentView = {
  id: string;
  kind: ClinicalDocumentKind;
  title: string;
  description: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: Date;
  authorName: string;
  appointment: { id: string; startsAt: Date; serviceNameSnapshot: string } | null;
};

/**
 * Lista os anexos (metadados decifrados: título, descrição, nome). Não gera
 * log: o conteúdo só é lido em openDocument, e é lá que fica o READ.
 */
export async function listDocuments(actor: Actor, patientId: string): Promise<ClinicalDocumentView[]> {
  const professionalId = await requireClinicalAccess(actor, patientId);
  const rows = await db.clinicalDocument.findMany({
    where: { patientId, professionalId, deletedAt: null, patient: { organizationId: actor.organizationId } },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      appointment: { select: { id: true, startsAt: true, serviceNameSnapshot: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: decrypt(r.titleEnc),
    description: r.descriptionEnc ? decrypt(r.descriptionEnc) : null,
    fileName: decrypt(r.fileNameEnc),
    contentType: r.contentType,
    sizeBytes: r.sizeBytes,
    createdAt: r.createdAt,
    authorName: r.author.name,
    appointment: r.appointment,
  }));
}

export class InvalidDocument extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDocument";
  }
}

/**
 * Anexa um arquivo. Ordem importa: valida → cifra → grava o blob → grava a
 * linha. Se a linha falhar, o blob órfão é apagado (melhor esforço). O blob
 * nunca existe em claro fora da memória deste processo.
 */
export async function createDocument(
  actor: Actor,
  input: {
    patientId: string;
    kind: ClinicalDocumentKind;
    title: string;
    description: string | null;
    appointmentId: string | null;
    fileName: string;
    bytes: Buffer;
  },
): Promise<string> {
  const professionalId = await requireClinicalAccess(actor, input.patientId);

  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new InvalidDocument("Paciente não encontrado");

  if (input.bytes.length === 0) throw new InvalidDocument("Arquivo vazio");
  if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new InvalidDocument("Arquivo maior que 8 MB. Reduza a resolução ou divida em partes.");
  const type = sniffDocument(input.bytes);
  if (!type) throw new InvalidDocument("Formato não aceito. Envie PDF, JPG, PNG ou WebP (Word/Excel: exporte em PDF).");

  if (input.appointmentId) {
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: input.patientId, professionalId }, select: { id: true } });
    if (!a) throw new InvalidDocument("Sessão inválida para este documento");
  }

  const storage = getStorage();
  const storageKey = "clinical/" + input.patientId + "/" + randomUUID() + ".bin";
  const { key } = await storage.putPrivate(storageKey, encryptBytes(input.bytes));

  try {
    const doc = await db.clinicalDocument.create({
      data: {
        patientId: input.patientId,
        professionalId,
        authorUserId: actor.userId,
        appointmentId: input.appointmentId,
        kind: input.kind,
        titleEnc: encrypt(input.title),
        descriptionEnc: input.description ? encrypt(input.description) : null,
        fileNameEnc: encrypt(safeFileName(input.fileName, DOCUMENT_EXT[type])),
        contentType: DOCUMENT_MIME[type],
        sizeBytes: input.bytes.length,
        storageKey: key,
      },
      select: { id: true },
    });
    await logDocumentAccess([doc.id], actor.userId, "WRITE");
    return doc.id;
  } catch (e) {
    await storage.deletePrivate(key).catch(() => {});
    throw e;
  }
}

/** Lê e decifra o arquivo para entrega ao profissional autorizado. Registra READ. */
export async function openDocument(actor: Actor, documentId: string): Promise<{ bytes: Buffer; contentType: string; fileName: string } | null> {
  const doc = await db.clinicalDocument.findFirst({
    where: { id: documentId, deletedAt: null, patient: { organizationId: actor.organizationId } },
    select: { patientId: true, professionalId: true, storageKey: true, contentType: true, fileNameEnc: true },
  });
  if (!doc) return null;
  const professionalId = await requireClinicalAccess(actor, doc.patientId);
  if (doc.professionalId !== professionalId) throw new ClinicalAccessDenied();

  const blob = await getStorage().getPrivate(doc.storageKey);
  if (!blob) throw new Error("Arquivo não encontrado no storage");
  const bytes = decryptBytes(blob);
  await logDocumentAccess([documentId], actor.userId, "READ");
  return { bytes, contentType: doc.contentType, fileName: decrypt(doc.fileNameEnc) };
}

/** Exclusão lógica com motivo; o blob cifrado fica até a anonimização (dever de guarda). */
export async function deleteDocument(actor: Actor, documentId: string, reason: string): Promise<void> {
  const doc = await db.clinicalDocument.findUnique({ where: { id: documentId }, select: { patientId: true } });
  if (!doc) throw new Error("Documento não encontrado");
  const professionalId = await requireClinicalAccess(actor, doc.patientId);
  const r = await db.clinicalDocument.updateMany({
    where: { id: documentId, professionalId, deletedAt: null },
    data: { deletedAt: new Date(), deletedReason: reason },
  });
  if (r.count === 0) throw new Error("Documento não encontrado");
  await logDocumentAccess([documentId], actor.userId, "DELETE");
}

/**
 * Apaga de vez os blobs de um paciente (anonimização LGPD). Chamado fora da
 * transação: storage não participa de rollback. Devolve o que falhou para o
 * job tentar de novo.
 */
export async function purgeDocumentBlobs(storageKeys: string[]): Promise<string[]> {
  const storage = getStorage();
  const failed: string[] = [];
  for (const key of storageKeys) {
    try {
      await storage.deletePrivate(key);
    } catch {
      failed.push(key);
    }
  }
  return failed;
}
