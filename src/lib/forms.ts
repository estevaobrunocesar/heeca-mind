import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { FormDataClass, FormKind } from "@/generated/prisma/enums";
import { audit } from "./audit";
import { clinicalScopes, ClinicalAccessDenied } from "./clinical";
import { decrypt, encrypt } from "./crypto";
import { db } from "./db";
import { fieldsSchema, type Answers, type FormField } from "./forms-schema";
import { enqueueFormRequest } from "./notifications";
import { canManageSchedule, type Actor } from "./permissions";
import { clientIp } from "./rate-limit";

/**
 * Formulários pré-atendimento.
 *
 * - Modelo (FormTemplate) pertence a um profissional.
 * - Pedido (FormRequest) = snapshot + token de uso único enviado ao paciente.
 * - Respostas CLINICAL ficam cifradas e só saem por readAnswers, que aplica
 *   as regras do prontuário (clinicalScopes) e registra ClinicalAccessLog.
 *   Respostas ADMINISTRATIVE (termos) ficam em claro, para quem gerencia a agenda.
 */

export const REQUEST_TTL_DAYS = 30;

export const FORM_KIND_LABEL: Record<FormKind, string> = {
  INTAKE: "Ficha inicial",
  CONSENT: "Termo de consentimento",
  QUESTIONNAIRE: "Questionário",
  CUSTOM: "Personalizado",
};

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

export class FormError extends Error {}

// ───────────────────────────────────────────────────────────────
// Modelos
// ───────────────────────────────────────────────────────────────

export type TemplateInput = { title: string; description: string | null; kind: FormKind; dataClass: FormDataClass; fields: unknown; autoSendOnFirstSession: boolean };

export async function saveTemplate(actor: Actor, professionalId: string, input: TemplateInput, templateId?: string): Promise<{ id: string; fieldErrors?: Record<string, string[]> }> {
  const parsed = fieldsSchema.safeParse(input.fields);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => (i.path.length ? `Campo ${Number(i.path[0]) + 1}: ${i.message}` : i.message));
    return { id: templateId ?? "", fieldErrors: { fields: msg } };
  }
  const data = { title: input.title, description: input.description, kind: input.kind, dataClass: input.dataClass, fields: parsed.data, autoSendOnFirstSession: input.autoSendOnFirstSession };
  if (templateId) {
    const r = await db.formTemplate.updateMany({ where: { id: templateId, professionalId, organizationId: actor.organizationId }, data });
    if (r.count === 0) throw new FormError("Modelo não encontrado");
    await audit(actor, { organizationId: actor.organizationId, action: "form_template.update", entityType: "FormTemplate", entityId: templateId, after: { title: input.title, dataClass: input.dataClass } });
    return { id: templateId };
  }
  const t = await db.formTemplate.create({ data: { ...data, organizationId: actor.organizationId, professionalId }, select: { id: true } });
  await audit(actor, { organizationId: actor.organizationId, action: "form_template.create", entityType: "FormTemplate", entityId: t.id, after: { title: input.title, dataClass: input.dataClass } });
  return { id: t.id };
}

export async function setTemplateActive(actor: Actor, professionalId: string, templateId: string, isActive: boolean) {
  const r = await db.formTemplate.updateMany({ where: { id: templateId, professionalId, organizationId: actor.organizationId }, data: { isActive } });
  if (r.count === 0) throw new FormError("Modelo não encontrado");
  await audit(actor, { organizationId: actor.organizationId, action: isActive ? "form_template.activate" : "form_template.deactivate", entityType: "FormTemplate", entityId: templateId });
}

// ───────────────────────────────────────────────────────────────
// Pedidos
// ───────────────────────────────────────────────────────────────

/**
 * Cria o pedido e enfileira o WhatsApp. Devolve o token em claro uma única
 * vez (vai só na mensagem). Evita duplicar: um pedido PENDING do mesmo
 * modelo para o mesmo paciente é reaproveitado (reenvio).
 */
export async function sendForm(
  actor: Actor | null,
  input: { templateId: string; patientId: string; appointmentId: string | null },
): Promise<{ requestId: string; resent: boolean }> {
  const t = await db.formTemplate.findFirst({
    where: { id: input.templateId, isActive: true },
    select: { id: true, organizationId: true, professionalId: true, title: true, description: true, dataClass: true, fields: true },
  });
  if (!t) throw new FormError("Modelo não encontrado ou inativo");
  if (actor && (actor.organizationId !== t.organizationId || !canManageSchedule(actor, t.professionalId))) throw new FormError("Sem permissão");

  const patient = await db.patient.findFirst({ where: { id: input.patientId, organizationId: t.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) throw new FormError("Paciente não encontrado");
  if (input.appointmentId) {
    const a = await db.appointment.findFirst({ where: { id: input.appointmentId, patientId: patient.id, professionalId: t.professionalId }, select: { id: true } });
    if (!a) throw new FormError("Sessão inválida");
  }

  const token = randomBytes(32).toString("base64url");
  const existing = await db.formRequest.findFirst({
    where: { templateId: t.id, patientId: patient.id, status: "PENDING" },
    select: { id: true },
  });
  let requestId: string;
  if (existing) {
    // Reenvio: novo token invalida o link anterior.
    await db.formRequest.update({
      where: { id: existing.id },
      data: { tokenHash: hashToken(token), sentAt: new Date(), expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000), appointmentId: input.appointmentId ?? undefined },
    });
    requestId = existing.id;
  } else {
    const r = await db.formRequest.create({
      data: {
        organizationId: t.organizationId,
        professionalId: t.professionalId,
        patientId: patient.id,
        appointmentId: input.appointmentId,
        templateId: t.id,
        createdByUserId: actor?.userId ?? null,
        titleSnapshot: t.title,
        descriptionSnapshot: t.description,
        dataClass: t.dataClass,
        fieldsSnapshot: t.fields as object,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + REQUEST_TTL_DAYS * 86_400_000),
      },
      select: { id: true },
    });
    requestId = r.id;
  }
  await audit(actor, { organizationId: t.organizationId, action: existing ? "form_request.resend" : "form_request.send", entityType: "FormRequest", entityId: requestId, after: { templateId: t.id, patientId: patient.id, auto: actor === null } });
  await enqueueFormRequest(requestId, token);
  return { requestId, resent: !!existing };
}

export async function cancelFormRequest(actor: Actor, requestId: string) {
  const r = await db.formRequest.findFirst({ where: { id: requestId, organizationId: actor.organizationId }, select: { id: true, professionalId: true, status: true } });
  if (!r || !canManageSchedule(actor, r.professionalId)) throw new FormError("Sem permissão");
  if (r.status !== "PENDING") throw new FormError("Este pedido já foi respondido ou encerrado");
  await db.formRequest.update({ where: { id: r.id }, data: { status: "CANCELLED" } });
  await audit(actor, { organizationId: actor.organizationId, action: "form_request.cancel", entityType: "FormRequest", entityId: r.id });
}

/** Página pública: carrega o pedido pelo token, se ainda válido. */
export async function loadRequestByToken(token: string) {
  const r = await db.formRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      status: true,
      expiresAt: true,
      titleSnapshot: true,
      descriptionSnapshot: true,
      fieldsSnapshot: true,
      dataClass: true,
      patient: { select: { name: true } },
      professional: { select: { displayName: true } },
    },
  });
  if (!r) return null;
  return { ...r, fields: r.fieldsSnapshot as FormField[], expired: r.status === "PENDING" && r.expiresAt < new Date() };
}

/** Grava as respostas (uso único). CLINICAL cifra; ADMINISTRATIVE em claro. */
export async function submitAnswers(token: string, answers: Answers): Promise<void> {
  const r = await db.formRequest.findUnique({ where: { tokenHash: hashToken(token) }, select: { id: true, status: true, expiresAt: true, dataClass: true, organizationId: true } });
  if (!r || r.status !== "PENDING") throw new FormError("Este link não está mais válido.");
  if (r.expiresAt < new Date()) throw new FormError("Este link expirou. Peça um novo ao profissional.");
  const ip = await clientIp();
  const res = await db.formRequest.updateMany({
    where: { id: r.id, status: "PENDING" },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      submittedIp: ip,
      answersEnc: r.dataClass === "CLINICAL" ? encrypt(JSON.stringify(answers)) : null,
      answersJson: r.dataClass === "ADMINISTRATIVE" ? (answers as object) : undefined,
    },
  });
  if (res.count === 0) throw new FormError("Este link não está mais válido.");
  await audit(null, { organizationId: r.organizationId, action: "form_request.submit", entityType: "FormRequest", entityId: r.id });
}

/** Cron: pedidos pendentes vencidos viram EXPIRED. */
export async function expireFormRequests(): Promise<number> {
  const r = await db.formRequest.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } });
  return r.count;
}

/**
 * Cron: envio automático na primeira sessão confirmada. Candidatos: sessões
 * CONFIRMED futuras cujo paciente não tem sessão concluída anterior com o
 * profissional e ainda não recebeu o modelo.
 */
export async function autoSendFirstSessionForms(): Promise<number> {
  const templates = await db.formTemplate.findMany({ where: { isActive: true, autoSendOnFirstSession: true }, select: { id: true, professionalId: true } });
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
          formRequests: { none: { templateId: t.id } },
        },
      },
      distinct: ["patientId"],
      select: { id: true, patientId: true },
    });
    for (const a of firsts) {
      try {
        await sendForm(null, { templateId: t.id, patientId: a.patientId, appointmentId: a.id });
        sent++;
      } catch (e) {
        console.error("[forms] envio automático falhou", t.id, a.patientId, e);
      }
    }
  }
  return sent;
}

// ───────────────────────────────────────────────────────────────
// Leitura
// ───────────────────────────────────────────────────────────────

export type FormRequestView = {
  id: string;
  title: string;
  dataClass: FormDataClass;
  status: "PENDING" | "SUBMITTED" | "EXPIRED" | "CANCELLED";
  sentAt: Date;
  submittedAt: Date | null;
  expiresAt: Date;
  appointment: { id: string; startsAt: Date } | null;
  /** Pode abrir as respostas? (só SUBMITTED, e conforme a classe) */
  canRead: boolean;
};

/** Pedidos de um paciente visíveis ao ator, com a permissão de leitura já resolvida. */
export async function listRequestsForPatient(actor: Actor, patientId: string): Promise<FormRequestView[]> {
  const rows = await db.formRequest.findMany({
    where: { patientId, organizationId: actor.organizationId },
    orderBy: { sentAt: "desc" },
    select: { id: true, titleSnapshot: true, dataClass: true, status: true, sentAt: true, submittedAt: true, expiresAt: true, professionalId: true, appointment: { select: { id: true, startsAt: true } } },
  });
  const scopes = rows.some((r) => r.dataClass === "CLINICAL") ? await clinicalScopes(actor, patientId) : [];
  return rows.map((r) => ({
    id: r.id,
    title: r.titleSnapshot,
    dataClass: r.dataClass,
    status: r.status,
    sentAt: r.sentAt,
    submittedAt: r.submittedAt,
    expiresAt: r.expiresAt,
    appointment: r.appointment,
    canRead:
      r.status === "SUBMITTED" &&
      (r.dataClass === "ADMINISTRATIVE" ? canManageSchedule(actor, r.professionalId) : scopes.some((s) => s.professionalId === r.professionalId)),
  }));
}

/** Abre as respostas. CLINICAL: regras do prontuário + log READ. */
export async function readAnswers(actor: Actor, requestId: string): Promise<{ title: string; description: string | null; dataClass: FormDataClass; fields: FormField[]; answers: Answers; submittedAt: Date; patientName: string; patientId: string } | null> {
  const r = await db.formRequest.findFirst({
    where: { id: requestId, organizationId: actor.organizationId, status: "SUBMITTED" },
    select: { id: true, professionalId: true, patientId: true, titleSnapshot: true, descriptionSnapshot: true, dataClass: true, fieldsSnapshot: true, answersEnc: true, answersJson: true, submittedAt: true, patient: { select: { name: true } } },
  });
  if (!r) return null;
  let answers: Answers;
  if (r.dataClass === "CLINICAL") {
    const scopes = await clinicalScopes(actor, r.patientId);
    const scope = scopes.find((s) => s.professionalId === r.professionalId);
    if (!scope) throw new ClinicalAccessDenied();
    answers = JSON.parse(decrypt(r.answersEnc ?? "")) as Answers;
    await db.clinicalAccessLog.create({ data: { formRequestId: r.id, userId: actor.userId, action: "READ", ip: await clientIp(), delegationId: scope.delegationId } });
  } else {
    if (!canManageSchedule(actor, r.professionalId)) throw new FormError("Sem permissão");
    answers = (r.answersJson ?? {}) as Answers;
  }
  return { title: r.titleSnapshot, description: r.descriptionSnapshot, dataClass: r.dataClass, fields: r.fieldsSnapshot as FormField[], answers, submittedAt: r.submittedAt!, patientName: r.patient.name, patientId: r.patientId };
}
