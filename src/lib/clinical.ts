import "server-only";
import { randomUUID } from "node:crypto";
import type { ClinicalDelegationKind, ClinicalDocumentKind, ClinicalNoteKind } from "@/generated/prisma/enums";
import { canDeleteClinicalEntry, isDelegationActive, pickWriteScope, type ClinicalScope } from "./clinical-delegation";
import { decrypt, decryptBytes, encrypt, encryptBytes } from "./crypto";
import { db } from "./db";
import { DOCUMENT_EXT, DOCUMENT_MIME, MAX_DOCUMENT_BYTES, safeFileName, sniffDocument } from "./document";
import { canAccessClinicalData, type Actor } from "./permissions";
import { clientIp } from "./rate-limit";
import { getStorage } from "./storage";
import { notifyProfessional } from "./pro-notify";

/**
 * Prontuário: único ponto de acesso às notas e documentos clínicos.
 *
 * Invariantes:
 *  - Toda função resolve os ESCOPOS do ator (clinicalScopes) antes de
 *    decifrar qualquer coisa. Escopo = um prontuário visível: o próprio
 *    (profissional responsável) ou o de um colega, por delegação ativa.
 *  - Toda leitura/escrita/exclusão/impressão gera ClinicalAccessLog; acessos
 *    por delegação levam delegationId.
 *  - Conteúdo só existe em claro dentro destas funções e na resposta ao
 *    profissional autorizado; nunca vai para logs, auditoria ou notificações.
 *  - Notas são imutáveis; exclusão é lógica com motivo.
 */

export class ClinicalAccessDenied extends Error {
  constructor(message = "Acesso ao prontuário não permitido") {
    super(message);
    this.name = "ClinicalAccessDenied";
  }
}

export type ClinicalNoteView = {
  id: string;
  kind: ClinicalNoteKind;
  content: string;
  createdAt: Date;
  authorName: string;
  authorUserId: string;
  professionalId: string;
  /** Registrada por substituto. */
  viaDelegation: boolean;
  canDelete: boolean;
  appointment: { id: string; startsAt: Date; serviceNameSnapshot: string } | null;
};

export const KIND_LABEL: Record<ClinicalNoteKind, string> = {
  EVOLUTION: "Evolução de sessão",
  NOTE: "Anotação",
  ASSESSMENT: "Avaliação",
};

type AccessAction = "READ" | "WRITE" | "DELETE" | "EXPORT";

async function logAccess(entries: Array<{ noteId?: string; documentId?: string; delegationId: string | null }>, userId: string, action: AccessAction) {
  if (entries.length === 0) return;
  const ip = await clientIp();
  await db.clinicalAccessLog.createMany({
    data: entries.map((e) => ({ clinicalNoteId: e.noteId ?? null, clinicalDocumentId: e.documentId ?? null, delegationId: e.delegationId, userId, action, ip })),
  });
}

/**
 * "Responsável" é um fato do banco, não do papel: o profissional precisa
 * ter (ou ter tido) sessão com o paciente — pendente, confirmada, concluída
 * ou falta. Sessões só canceladas/expiradas não estabelecem relação clínica.
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
 * Escopos clínicos do ator sobre um paciente:
 *  1. o próprio prontuário, se for profissional e atende o paciente;
 *  2. um por delegação ativa recebida (do paciente ou "todos"), desde que o
 *     titular da delegação atenda o paciente — delegar não cria relação.
 * Regra pura (canAccessClinicalData) + fatos do banco.
 */
export async function clinicalScopes(actor: Actor, patientId: string, now = new Date()): Promise<ClinicalScope[]> {
  const pid = actor.professionalId;
  if (!pid || !canAccessClinicalData(actor, pid)) return [];

  const scopes: ClinicalScope[] = [];
  if (await isTreatingProfessional(pid, patientId)) scopes.push({ professionalId: pid, canWrite: true, delegationId: null });

  const delegations = await db.clinicalDelegation.findMany({
    where: {
      organizationId: actor.organizationId,
      delegateProfessionalId: pid,
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { gt: now },
      OR: [{ patientId }, { patientId: null }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, kind: true, canWrite: true, startsAt: true, expiresAt: true, revokedAt: true, grantorProfessionalId: true, grantor: { select: { displayName: true, isActive: true } } },
  });
  for (const d of delegations) {
    if (!isDelegationActive(d, now) || !d.grantor.isActive) continue;
    if (d.grantorProfessionalId === pid) continue;
    if (scopes.some((s) => s.professionalId === d.grantorProfessionalId)) continue;
    if (!(await isTreatingProfessional(d.grantorProfessionalId, patientId))) continue;
    scopes.push({ professionalId: d.grantorProfessionalId, canWrite: d.canWrite, delegationId: d.id, grantorName: d.grantor.displayName, kind: d.kind, expiresAt: d.expiresAt });
  }
  return scopes;
}

/** Escopos ou exceção — para funções que precisam de acesso. */
export async function requireClinicalAccess(actor: Actor, patientId: string): Promise<ClinicalScope[]> {
  const scopes = await clinicalScopes(actor, patientId);
  if (scopes.length === 0) throw new ClinicalAccessDenied();
  return scopes;
}

/** Versão booleana para páginas decidirem o que renderizar. */
export async function canOpenClinicalRecord(actor: Actor, patientId: string): Promise<boolean> {
  return (await clinicalScopes(actor, patientId)).length > 0;
}

/** Pode registrar evolução da sessão de `professionalId` com este paciente? (próprio ou substituição) */
export async function canWriteFor(actor: Actor, patientId: string, professionalId: string): Promise<boolean> {
  const scopes = await clinicalScopes(actor, patientId);
  return scopes.some((s) => s.professionalId === professionalId && s.canWrite);
}

function scopeFor(scopes: ClinicalScope[], professionalId: string): ClinicalScope {
  const s = scopes.find((x) => x.professionalId === professionalId);
  if (!s) throw new ClinicalAccessDenied();
  return s;
}

/** Notas do paciente em todos os escopos do ator. Registra READ de cada uma. */
export async function listNotes(actor: Actor, patientId: string): Promise<ClinicalNoteView[]> {
  const scopes = await requireClinicalAccess(actor, patientId);
  const rows = await db.clinicalNote.findMany({
    where: { patientId, professionalId: { in: scopes.map((s) => s.professionalId) }, deletedAt: null, patient: { organizationId: actor.organizationId } },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { name: true } },
      appointment: { select: { id: true, startsAt: true, serviceNameSnapshot: true } },
    },
  });
  await logAccess(rows.map((r) => ({ noteId: r.id, delegationId: scopeFor(scopes, r.professionalId).delegationId })), actor.userId, "READ");
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    content: decrypt(r.contentEnc),
    createdAt: r.createdAt,
    authorName: r.author.name,
    authorUserId: r.authorUserId,
    professionalId: r.professionalId,
    viaDelegation: r.delegationId !== null,
    canDelete: canDeleteClinicalEntry(scopes, r, actor.userId),
    appointment: r.appointment,
  }));
}

export async function createNote(
  actor: Actor,
  input: { patientId: string; kind: ClinicalNoteKind; content: string; appointmentId: string | null },
): Promise<string> {
  const scopes = await requireClinicalAccess(actor, input.patientId);
  const target = pickWriteScope(scopes);
  if (!target) throw new ClinicalAccessDenied("Acesso somente leitura (supervisão): não é possível registrar");

  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new Error("Paciente não encontrado");

  if (input.appointmentId) {
    // A sessão precisa ser deste paciente com o titular do prontuário de destino.
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: input.patientId, professionalId: target.professionalId }, select: { id: true } });
    if (!a) throw new Error("Sessão inválida para esta evolução");
  }

  const note = await db.clinicalNote.create({
    data: {
      patientId: input.patientId,
      professionalId: target.professionalId,
      authorUserId: actor.userId,
      appointmentId: input.appointmentId,
      delegationId: target.delegationId,
      kind: input.kind,
      contentEnc: encrypt(input.content),
    },
    select: { id: true },
  });
  await logAccess([{ noteId: note.id, delegationId: target.delegationId }], actor.userId, "WRITE");
  return note.id;
}

/** Exclusão lógica com motivo. O conteúdo permanece cifrado até a anonimização (dever de guarda). */
export async function deleteNote(actor: Actor, noteId: string, reason: string): Promise<void> {
  const note = await db.clinicalNote.findUnique({ where: { id: noteId }, select: { patientId: true, professionalId: true, authorUserId: true } });
  if (!note) throw new Error("Nota não encontrada");
  const scopes = await requireClinicalAccess(actor, note.patientId);
  if (!canDeleteClinicalEntry(scopes, note, actor.userId)) throw new ClinicalAccessDenied("Só o titular do prontuário (ou o autor, em substituição) exclui esta nota");
  const r = await db.clinicalNote.updateMany({
    where: { id: noteId, deletedAt: null },
    data: { deletedAt: new Date(), deletedReason: reason },
  });
  if (r.count === 0) throw new Error("Nota não encontrada");
  await logAccess([{ noteId, delegationId: scopeFor(scopes, note.professionalId).delegationId }], actor.userId, "DELETE");
}

/** Marca uma exportação/impressão (o conteúdo saiu do sistema). */
export async function logExport(actor: Actor, patientId: string, noteIds: string[]) {
  const scopes = await requireClinicalAccess(actor, patientId);
  const notes = await db.clinicalNote.findMany({ where: { id: { in: noteIds } }, select: { id: true, professionalId: true } });
  await logAccess(notes.map((n) => ({ noteId: n.id, delegationId: scopeFor(scopes, n.professionalId).delegationId })), actor.userId, "EXPORT");
}

/** Últimos acessos ao prontuário deste paciente, nos escopos do ator (transparência). */
export async function recentAccess(actor: Actor, patientId: string, take = 20) {
  const scopes = await requireClinicalAccess(actor, patientId);
  const pros = scopes.map((s) => s.professionalId);
  const rows = await db.clinicalAccessLog.findMany({
    where: {
      OR: [
        { clinicalNote: { patientId, professionalId: { in: pros } } },
        { clinicalDocument: { patientId, professionalId: { in: pros } } },
        { formRequest: { patientId, professionalId: { in: pros } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { action: true, createdAt: true, ip: true, userId: true, delegation: { select: { kind: true } } },
  });
  const users = await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
  const name = new Map(users.map((u) => [u.id, u.name]));
  return rows.map((r) => ({ ...r, userName: name.get(r.userId) ?? "?", viaDelegation: r.delegation?.kind ?? null }));
}

/** Sessões realizadas no prontuário de destino — para vincular um documento. */
export async function treatedSessions(actor: Actor, patientId: string) {
  const scopes = await requireClinicalAccess(actor, patientId);
  const target = pickWriteScope(scopes);
  if (!target) return [];
  return db.appointment.findMany({
    where: { patientId, professionalId: target.professionalId, status: { in: ["COMPLETED", "CONFIRMED", "NO_SHOW"] }, startsAt: { lte: new Date() } },
    orderBy: { startsAt: "desc" },
    take: 50,
    select: { id: true, startsAt: true, serviceNameSnapshot: true },
  });
}

/** Sessões do prontuário de destino que ainda não têm evolução — para o formulário. */
export async function sessionsWithoutEvolution(actor: Actor, patientId: string) {
  const scopes = await requireClinicalAccess(actor, patientId);
  const target = pickWriteScope(scopes);
  if (!target) return [];
  return db.appointment.findMany({
    where: {
      patientId,
      professionalId: target.professionalId,
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
  viaDelegation: boolean;
  canDelete: boolean;
  appointment: { id: string; startsAt: Date; serviceNameSnapshot: string } | null;
};

/**
 * Lista os anexos (metadados decifrados: título, descrição, nome). Não gera
 * log: o conteúdo só é lido em openDocument, e é lá que fica o READ.
 */
export async function listDocuments(actor: Actor, patientId: string): Promise<ClinicalDocumentView[]> {
  const scopes = await requireClinicalAccess(actor, patientId);
  const rows = await db.clinicalDocument.findMany({
    where: { patientId, professionalId: { in: scopes.map((s) => s.professionalId) }, deletedAt: null, patient: { organizationId: actor.organizationId } },
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
    viaDelegation: r.delegationId !== null,
    canDelete: canDeleteClinicalEntry(scopes, r, actor.userId),
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
  const scopes = await requireClinicalAccess(actor, input.patientId);
  const target = pickWriteScope(scopes);
  if (!target) throw new ClinicalAccessDenied("Acesso somente leitura (supervisão): não é possível anexar");

  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new InvalidDocument("Paciente não encontrado");

  if (input.bytes.length === 0) throw new InvalidDocument("Arquivo vazio");
  if (input.bytes.length > MAX_DOCUMENT_BYTES) throw new InvalidDocument("Arquivo maior que 8 MB. Reduza a resolução ou divida em partes.");
  const type = sniffDocument(input.bytes);
  if (!type) throw new InvalidDocument("Formato não aceito. Envie PDF, JPG, PNG ou WebP (Word/Excel: exporte em PDF).");

  if (input.appointmentId) {
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: input.patientId, professionalId: target.professionalId }, select: { id: true } });
    if (!a) throw new InvalidDocument("Sessão inválida para este documento");
  }

  const storage = getStorage();
  const storageKey = "clinical/" + input.patientId + "/" + randomUUID() + ".bin";
  const { key } = await storage.putPrivate(storageKey, encryptBytes(input.bytes));

  try {
    const doc = await db.clinicalDocument.create({
      data: {
        patientId: input.patientId,
        professionalId: target.professionalId,
        authorUserId: actor.userId,
        appointmentId: input.appointmentId,
        delegationId: target.delegationId,
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
    await logAccess([{ documentId: doc.id, delegationId: target.delegationId }], actor.userId, "WRITE");
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
  const scopes = await requireClinicalAccess(actor, doc.patientId);
  const scope = scopeFor(scopes, doc.professionalId);

  const blob = await getStorage().getPrivate(doc.storageKey);
  if (!blob) throw new Error("Arquivo não encontrado no storage");
  const bytes = decryptBytes(blob);
  await logAccess([{ documentId, delegationId: scope.delegationId }], actor.userId, "READ");
  return { bytes, contentType: doc.contentType, fileName: decrypt(doc.fileNameEnc) };
}

/** Exclusão lógica com motivo; o blob cifrado fica até a anonimização (dever de guarda). */
export async function deleteDocument(actor: Actor, documentId: string, reason: string): Promise<void> {
  const doc = await db.clinicalDocument.findUnique({ where: { id: documentId }, select: { patientId: true, professionalId: true, authorUserId: true } });
  if (!doc) throw new Error("Documento não encontrado");
  const scopes = await requireClinicalAccess(actor, doc.patientId);
  if (!canDeleteClinicalEntry(scopes, doc, actor.userId)) throw new ClinicalAccessDenied("Só o titular do prontuário (ou o autor, em substituição) exclui este documento");
  const r = await db.clinicalDocument.updateMany({
    where: { id: documentId, deletedAt: null },
    data: { deletedAt: new Date(), deletedReason: reason },
  });
  if (r.count === 0) throw new Error("Documento não encontrado");
  await logAccess([{ documentId, delegationId: scopeFor(scopes, doc.professionalId).delegationId }], actor.userId, "DELETE");
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

// ───────────────────────────────────────────────────────────────
// Delegações (supervisão / substituição) — gestão pelo titular
// ───────────────────────────────────────────────────────────────

export type DelegationView = {
  id: string;
  kind: ClinicalDelegationKind;
  reason: string;
  startsAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  active: boolean;
  patient: { id: string; name: string } | null;
  grantor: { id: string; displayName: string };
  delegate: { id: string; displayName: string };
};

const delegationSelect = {
  id: true,
  kind: true,
  reason: true,
  startsAt: true,
  expiresAt: true,
  revokedAt: true,
  patient: { select: { id: true, name: true } },
  grantor: { select: { id: true, displayName: true } },
  delegate: { select: { id: true, displayName: true } },
} as const;

type DelegationRow = Omit<DelegationView, "active">;
const toView = (d: DelegationRow): DelegationView => ({ ...d, active: isDelegationActive(d) });

/** Delegações concedidas e recebidas pelo profissional do ator. */
export async function listDelegations(actor: Actor): Promise<{ granted: DelegationView[]; received: DelegationView[] }> {
  const pid = actor.professionalId;
  if (!pid) return { granted: [], received: [] };
  const rows = await db.clinicalDelegation.findMany({
    where: { organizationId: actor.organizationId, OR: [{ grantorProfessionalId: pid }, { delegateProfessionalId: pid }] },
    orderBy: [{ revokedAt: "asc" }, { expiresAt: "desc" }],
    select: { ...delegationSelect, grantorProfessionalId: true },
  });
  const views = rows.map((r) => ({ v: toView(r), mine: r.grantorProfessionalId === pid }));
  return { granted: views.filter((x) => x.mine).map((x) => x.v), received: views.filter((x) => !x.mine).map((x) => x.v) };
}

/** Delegações vigentes sobre um paciente concedidas pelo profissional do ator (painel "compartilhado com"). */
export async function activeDelegationsFor(actor: Actor, patientId: string): Promise<DelegationView[]> {
  const pid = actor.professionalId;
  if (!pid) return [];
  const rows = await db.clinicalDelegation.findMany({
    where: { organizationId: actor.organizationId, grantorProfessionalId: pid, revokedAt: null, expiresAt: { gt: new Date() }, OR: [{ patientId }, { patientId: null }] },
    orderBy: { expiresAt: "asc" },
    select: delegationSelect,
  });
  return rows.map(toView);
}

/**
 * Concede. Só o titular (profissional do ator) delega; o delegado precisa
 * ser outro profissional ativo da mesma organização com login; para um
 * paciente específico, o titular precisa atendê-lo.
 */
export async function grantDelegation(
  actor: Actor,
  input: { delegateProfessionalId: string; patientId: string | null; kind: ClinicalDelegationKind; reason: string; startsAt: Date; expiresAt: Date },
): Promise<string> {
  const pid = actor.professionalId;
  if (!pid || !canAccessClinicalData(actor, pid)) throw new ClinicalAccessDenied("Só um profissional delega o próprio prontuário");
  if (input.delegateProfessionalId === pid) throw new Error("Não é possível delegar para si mesmo");

  const delegate = await db.professional.findFirst({
    where: { id: input.delegateProfessionalId, organizationId: actor.organizationId, isActive: true, userId: { not: null } },
    select: { id: true },
  });
  if (!delegate) throw new Error("Profissional inválido (precisa ser da mesma organização, ativo e com login)");

  if (input.patientId) {
    const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
    if (!patient) throw new Error("Paciente não encontrado");
    if (!(await isTreatingProfessional(pid, input.patientId))) throw new ClinicalAccessDenied("Você só delega prontuários de pacientes que atende");
  }

  const d = await db.clinicalDelegation.create({
    data: {
      organizationId: actor.organizationId,
      patientId: input.patientId,
      grantorProfessionalId: pid,
      delegateProfessionalId: input.delegateProfessionalId,
      createdByUserId: actor.userId,
      kind: input.kind,
      canWrite: input.kind === "SUBSTITUTION",
      reason: input.reason,
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
    },
    select: { id: true },
  });
  await notifyProfessional({ event: "DELEGATION_RECEIVED", delegationId: d.id });
  return d.id;
}

/** Revoga (só o titular). Efeito imediato: o próximo acesso do delegado já falha. */
export async function revokeDelegation(actor: Actor, delegationId: string, reason: string): Promise<void> {
  const pid = actor.professionalId;
  if (!pid) throw new ClinicalAccessDenied();
  const r = await db.clinicalDelegation.updateMany({
    where: { id: delegationId, organizationId: actor.organizationId, grantorProfessionalId: pid, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  if (r.count === 0) throw new Error("Delegação não encontrada ou já encerrada");
}
