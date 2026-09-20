import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { DocumentKind } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { enqueueDocumentRequest } from "@/lib/notifications";
import type { Actor } from "@/lib/permissions";
import { canManageSchedule } from "@/lib/permissions";
import { notifyProfessional } from "@/lib/pro-notify";
import { clientIp } from "@/lib/rate-limit";
import { formatRegistration } from "@/lib/registration";
import { formatDateBR, formatDateTimeBR } from "@/lib/time";
import { acceptanceHash, bodyHash, canAccept, DEFAULT_DOCUMENT_TEMPLATES, isNewVersion, nameMatches, renderDocument, unknownVariables, type DocumentVariable } from "./rules";

/**
 * Documentos administrativos e consentimentos (§15; docs/mind/03-FLUXOS.md F7).
 * Mesmo desenho dos formulários: token só-hash, link público de uso único, reenvio invalida o
 * anterior, expiração no cron. Diferença: aqui o paciente ACEITA um texto congelado — o snapshot
 * renderizado e seu hash são a prova do que foi aceito.
 */

export const DOCUMENT_TTL_DAYS = 30;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export class DocumentError extends Error {}

// ── Modelos ─────────────────────────────────────────────────────────────────

export type TemplateInput = { kind: DocumentKind; title: string; body: string; requireBeforeFirstSession: boolean; isActive: boolean };

export async function saveDocumentTemplate(actor: Actor, professionalId: string, input: TemplateInput, templateId?: string): Promise<{ id: string; fieldErrors?: Record<string, string[]> }> {
  const unknown = unknownVariables(input.body);
  if (unknown.length) return { id: templateId ?? "", fieldErrors: { body: [`Variável desconhecida: ${unknown.map((v) => `{{${v}}}`).join(", ")}`] } };
  if (templateId) {
    const before = await db.documentTemplate.findFirst({ where: { id: templateId, professionalId, organizationId: actor.organizationId } });
    if (!before) throw new DocumentError("Modelo não encontrado");
    const bump = isNewVersion(before, input);
    const after = await db.documentTemplate.update({ where: { id: templateId }, data: { ...input, version: bump ? before.version + 1 : before.version } });
    await audit(actor, { organizationId: actor.organizationId, action: "document_template.update", entityType: "DocumentTemplate", entityId: templateId, before: { version: before.version, title: before.title }, after: { version: after.version, title: after.title } });
    return { id: templateId };
  }
  const t = await db.documentTemplate.create({ data: { ...input, organizationId: actor.organizationId, professionalId, createdByUserId: actor.userId }, select: { id: true } });
  await audit(actor, { organizationId: actor.organizationId, action: "document_template.create", entityType: "DocumentTemplate", entityId: t.id, after: { title: input.title, kind: input.kind } });
  return { id: t.id };
}

/** "Instalar modelos iniciais": cria os que ainda não existem (por título). */
export async function installDefaultTemplates(actor: Actor, professionalId: string): Promise<number> {
  const existing = new Set((await db.documentTemplate.findMany({ where: { professionalId }, select: { title: true } })).map((t) => t.title));
  let n = 0;
  for (const t of DEFAULT_DOCUMENT_TEMPLATES) {
    if (existing.has(t.title)) continue;
    await db.documentTemplate.create({ data: { ...t, organizationId: actor.organizationId, professionalId, createdByUserId: actor.userId } });
    n++;
  }
  if (n) await audit(actor, { organizationId: actor.organizationId, action: "document_template.install_defaults", entityType: "Professional", entityId: professionalId, after: { installed: n } });
  return n;
}

// ── Envio ───────────────────────────────────────────────────────────────────

async function variableValues(input: { patientId: string; professionalId: string; appointmentId?: string | null }): Promise<Partial<Record<DocumentVariable, string>>> {
  const [patient, pro, appt] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id: input.patientId }, select: { name: true } }),
    db.professional.findUniqueOrThrow({ where: { id: input.professionalId }, select: { displayName: true, registrationKind: true, registrationNumber: true, organization: { select: { name: true, legalName: true, document: true, timezone: true, type: true } } } }),
    input.appointmentId ? db.appointment.findUnique({ where: { id: input.appointmentId }, select: { serviceNameSnapshot: true, priceCents: true, startsAt: true } }) : Promise.resolve(null),
  ]);
  const org = pro.organization;
  const doc = org.document ? (org.document.length === 14 ? org.document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : org.document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")) : undefined;
  return {
    "paciente.nome": patient.name,
    "profissional.nome": pro.displayName,
    "profissional.registro": formatRegistration(pro, { force: true }) ?? undefined,
    "clinica.nome": org.type === "CLINIC" ? org.name : org.legalName || org.name,
    "clinica.documento": doc,
    servico: appt?.serviceNameSnapshot,
    valor: appt ? formatBRL(appt.priceCents) : undefined,
    "sessao.data": appt ? formatDateTimeBR(appt.startsAt, org.timezone) : undefined,
    data: formatDateBR(new Date(), org.timezone),
  };
}

/**
 * Envia (ou reenvia) um documento. `actor = null` = envio automático do cron.
 * Um pedido em aberto por (modelo, paciente): reenviar troca o token e o snapshot.
 */
export async function sendDocument(actor: Actor | null, input: { templateId: string; patientId: string; appointmentId?: string | null }): Promise<{ requestId: string; missing: string[] }> {
  const t = await db.documentTemplate.findFirst({ where: { id: input.templateId, isActive: true } });
  if (!t) throw new DocumentError("Modelo não encontrado ou inativo");
  if (actor && (actor.organizationId !== t.organizationId || !canManageSchedule(actor, t.professionalId))) throw new DocumentError("Sem permissão");
  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: t.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new DocumentError("Paciente não encontrado");
  if (input.appointmentId) {
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: patient.id, professionalId: t.professionalId }, select: { id: true } });
    if (!a) throw new DocumentError("Sessão inválida");
  }

  const values = await variableValues({ patientId: patient.id, professionalId: t.professionalId, appointmentId: input.appointmentId });
  const { text, missing } = renderDocument(t.body, values);
  const token = randomBytes(32).toString("base64url");
  const data = {
    templateVersion: t.version,
    kind: t.kind,
    titleSnapshot: t.title,
    bodySnapshot: text,
    bodyHash: bodyHash(text),
    tokenHash: hashToken(token),
    status: "PENDING" as const,
    sentAt: new Date(),
    viewedAt: null,
    expiresAt: new Date(Date.now() + DOCUMENT_TTL_DAYS * 86_400_000),
    appointmentId: input.appointmentId ?? null,
    createdByUserId: actor?.userId ?? null,
  };
  const open = await db.documentRequest.findFirst({ where: { templateId: t.id, patientId: patient.id, status: { in: ["PENDING", "VIEWED"] } }, select: { id: true } });
  let requestId: string;
  if (open) {
    await db.documentRequest.update({ where: { id: open.id }, data });
    requestId = open.id;
  } else {
    const r = await db.documentRequest.create({ data: { ...data, organizationId: t.organizationId, professionalId: t.professionalId, patientId: patient.id, templateId: t.id }, select: { id: true } });
    requestId = r.id;
  }
  await audit(actor, { organizationId: t.organizationId, action: open ? "document.resend" : "document.send", entityType: "DocumentRequest", entityId: requestId, after: { templateId: t.id, version: t.version, patientId: patient.id, auto: actor === null, missing } });
  await enqueueDocumentRequest(requestId, token);
  return { requestId, missing };
}

export async function revokeDocument(actor: Actor, requestId: string, reason: string) {
  const r = await db.documentRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { id: true, professionalId: true, status: true } });
  if (!r) throw new DocumentError("Documento não encontrado");
  if (!canManageSchedule(actor, r.professionalId)) throw new DocumentError("Sem permissão");
  if (r.status === "ACCEPTED") throw new DocumentError("Documento já aceito não pode ser cancelado; envie uma nova versão.");
  await db.documentRequest.update({ where: { id: r.id }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: reason } });
  await audit(actor, { organizationId: actor.organizationId, action: "document.revoke", entityType: "DocumentRequest", entityId: r.id, after: { reason } });
}

// ── Link público ────────────────────────────────────────────────────────────

export async function loadDocumentByToken(token: string) {
  const r = await db.documentRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, status: true, expiresAt: true, titleSnapshot: true, bodySnapshot: true, bodyHash: true, acceptedAt: true, acceptName: true, templateVersion: true, kind: true, patient: { select: { name: true } }, professional: { select: { displayName: true, organization: { select: { name: true, timezone: true, logoUrl: true } } } } },
  });
  if (!r) return null;
  // Primeira abertura: registra visualização (não é aceite).
  if (r.status === "PENDING" && r.expiresAt > new Date()) {
    await db.documentRequest.update({ where: { id: r.id }, data: { status: "VIEWED", viewedAt: new Date() } });
    r.status = "VIEWED";
  }
  return { ...r, expired: (r.status === "PENDING" || r.status === "VIEWED") && r.expiresAt < new Date() };
}

/** Aceite pelo link: nome confere com o cadastro, dentro do prazo, uma única vez. */
export async function acceptDocument(token: string, typedName: string, userAgent: string | null): Promise<void> {
  const r = await db.documentRequest.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, status: true, expiresAt: true, bodyHash: true, organizationId: true, patient: { select: { name: true } } } });
  if (!r || !canAccept(r.status, r.expiresAt, new Date())) throw new DocumentError("Este link não está mais válido. Peça um novo ao profissional.");
  if (!nameMatches(typedName, r.patient.name)) throw new DocumentError("Digite seu nome completo como está no cadastro.");
  const ip = await clientIp();
  const acceptedAt = new Date();
  const res = await db.documentRequest.updateMany({
    where: { id: r.id, status: { in: ["PENDING", "VIEWED"] } },
    data: { status: "ACCEPTED", acceptedAt, acceptName: typedName.trim(), acceptIp: ip, acceptUserAgent: userAgent?.slice(0, 300) ?? null, acceptanceHash: acceptanceHash({ bodyHash: r.bodyHash, name: typedName, acceptedAt, ip }) },
  });
  if (res.count === 0) throw new DocumentError("Este link não está mais válido.");
  await audit(null, { organizationId: r.organizationId, action: "document.accept", entityType: "DocumentRequest", entityId: r.id, after: { ip } });
  await notifyProfessional({ event: "DOCUMENT_ACCEPTED", documentRequestId: r.id });
}

// ── Cron ────────────────────────────────────────────────────────────────────

export async function expireDocumentRequests(): Promise<number> {
  const r = await db.documentRequest.updateMany({ where: { status: { in: ["PENDING", "VIEWED"] }, expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return r.count;
}

/** Modelos "exigir antes da 1ª sessão": envia a quem tem 1ª sessão CONFIRMED futura e nunca recebeu/aceitou. */
export async function autoSendRequiredDocuments(): Promise<number> {
  const templates = await db.documentTemplate.findMany({ where: { isActive: true, requireBeforeFirstSession: true }, select: { id: true, professionalId: true } });
  let sent = 0;
  for (const t of templates) {
    const firsts = await db.appointment.findMany({
      where: {
        professionalId: t.professionalId,
        status: "CONFIRMED",
        startsAt: { gt: new Date() },
        patient: {
          deletedAt: null,
          appointments: { none: { professionalId: t.professionalId, status: { in: ["COMPLETED", "NO_SHOW"] } } },
          documentRequests: { none: { templateId: t.id, status: { in: ["PENDING", "VIEWED", "ACCEPTED"] } } },
        },
      },
      distinct: ["patientId"],
      select: { id: true, patientId: true },
    });
    for (const a of firsts) {
      try {
        await sendDocument(null, { templateId: t.id, patientId: a.patientId, appointmentId: a.id });
        sent++;
      } catch (e) {
        console.error("[documents] envio automático falhou", t.id, a.patientId, e);
      }
    }
  }
  return sent;
}

// ── Leitura interna ─────────────────────────────────────────────────────────

export async function listDocumentsForPatient(actor: Actor, patientId: string) {
  return db.documentRequest.findMany({
    where: { organizationId: actor.organizationId, patientId },
    orderBy: { sentAt: "desc" },
    select: { id: true, kind: true, titleSnapshot: true, templateVersion: true, status: true, sentAt: true, viewedAt: true, acceptedAt: true, expiresAt: true, professional: { select: { displayName: true } } },
  });
}

export async function getDocumentInTenant(actor: Actor, requestId: string) {
  const r = await db.documentRequest.findFirst({
    where: { id: requestId, organizationId: actor.organizationId },
    include: { patient: { select: { id: true, name: true } }, professional: { select: { displayName: true, organization: { select: { name: true, timezone: true } } } } },
  });
  if (!r) return null;
  if (!canManageSchedule(actor, r.professionalId)) return null;
  return r;
}
