"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { IMAGE_EXT, IMAGE_MIME, MAX_PHOTO_BYTES, sniffImage } from "@/lib/image";
import { getStorage } from "@/lib/storage";
import { dateTimeInTz, formatDateTimeBR } from "@/lib/time";
import {
  availabilitySchema,
  blockSchema,
  exceptionSchema,
  policySchema,
  profileSchema,
  retentionSchema,
  scheduleSettingsSchema,
} from "@/lib/validation/professional";
import { canManageMembers } from "@/lib/permissions";

/** Contexto comum: ator, profissional dono das configurações e fuso da organização. */
async function ctx() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) throw new Error("Usuário sem perfil profissional");
  if (!canEditProfessional(actor, actor.activeProfessionalId)) throw new Error("Sem permissão");
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: { timezone: true },
  });
  return { actor, professionalId: actor.activeProfessionalId, tz: org.timezone };
}

// ──────────────────────────────────────────────────────────────
// Perfil
// ──────────────────────────────────────────────────────────────

export async function updateProfileAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const data = parsed.data;

  const slugTaken = await db.professional.findFirst({
    where: { slug: data.slug, id: { not: professionalId } },
    select: { id: true },
  });
  if (slugTaken) {
    return { fieldErrors: { slug: ["Este link já está em uso por outro profissional"] }, values: formValues(formData) };
  }

  const before = await db.professional.findUniqueOrThrow({ where: { id: professionalId } });
  const after = await db.professional.update({ where: { id: professionalId }, data });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "professional.update",
    entityType: "Professional",
    entityId: professionalId,
    before,
    after,
  });

  revalidatePath("/configuracoes");
  revalidatePath(`/agendar/${before.slug}`);
  revalidatePath(`/agendar/${after.slug}`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// Foto profissional
// ──────────────────────────────────────────────────────────────

/**
 * Recebe a foto já recortada/redimensionada pelo cliente (canvas), valida
 * pelo conteúdo e grava no storage. A chave inclui um timestamp: cada upload
 * é uma URL nova, então cache agressivo é seguro e a antiga pode ser apagada.
 */
export async function uploadProfilePhotoAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { actor, professionalId } = await ctx();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione uma imagem." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Imagem muito grande (máx. 1,5 MB)." };

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) return { ok: false, error: "Formato não suportado. Use JPG, PNG ou WebP." };

  const before = await db.professional.findUniqueOrThrow({ where: { id: professionalId }, select: { photoKey: true, photoUrl: true } });
  const storage = getStorage();
  const { key, url } = await storage.put({
    key: `professionals/${professionalId}/photo-${Date.now()}.${IMAGE_EXT[kind]}`,
    body: buf,
    contentType: IMAGE_MIME[kind],
  });

  await db.professional.update({ where: { id: professionalId }, data: { photoUrl: url, photoKey: key } });
  if (before.photoKey && before.photoKey !== key) {
    await storage.delete(before.photoKey).catch(() => {}); // melhor esforço: a nova já está salva
  }

  await audit(actor, { organizationId: actor.organizationId, action: "professional.photo", entityType: "Professional", entityId: professionalId, before: { photoUrl: before.photoUrl }, after: { photoUrl: url } });
  revalidatePath("/configuracoes");
  return { ok: true, url };
}

export async function removeProfilePhotoAction(): Promise<void> {
  const { actor, professionalId } = await ctx();
  const before = await db.professional.findUniqueOrThrow({ where: { id: professionalId }, select: { photoKey: true, photoUrl: true, slug: true } });
  await db.professional.update({ where: { id: professionalId }, data: { photoUrl: null, photoKey: null } });
  if (before.photoKey) await getStorage().delete(before.photoKey).catch(() => {});
  await audit(actor, { organizationId: actor.organizationId, action: "professional.photo_remove", entityType: "Professional", entityId: professionalId, before: { photoUrl: before.photoUrl } });
  revalidatePath("/configuracoes");
  revalidatePath(`/agendar/${before.slug}`);
}

// ──────────────────────────────────────────────────────────────
// Regras da agenda
// ──────────────────────────────────────────────────────────────

export async function updateScheduleSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = scheduleSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const before = await db.scheduleSettings.findUnique({ where: { professionalId } });
  const after = await db.scheduleSettings.upsert({
    where: { professionalId },
    create: { professionalId, ...parsed.data },
    update: parsed.data,
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "scheduleSettings.update",
    entityType: "ScheduleSettings",
    entityId: after.id,
    before,
    after,
  });

  revalidatePath("/configuracoes/horarios");
  return { ok: true };
}

export async function saveAvailabilityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("rules") ?? "[]"));
  } catch {
    return { error: "Grade inválida" };
  }
  const parsed = availabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Grade inválida" };
  }

  const before = await db.availabilityRule.findMany({ where: { professionalId } });

  // Substituição total: mais simples e sem risco de faixas órfãs.
  await db.$transaction([
    db.availabilityRule.deleteMany({ where: { professionalId } }),
    db.availabilityRule.createMany({
      data: parsed.data.map((r) => ({ professionalId, ...r })),
    }),
  ]);

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "availability.replace",
    entityType: "Professional",
    entityId: professionalId,
    before: before.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
    after: parsed.data,
  });

  revalidatePath("/configuracoes/horarios");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// Bloqueios / exceções
// ──────────────────────────────────────────────────────────────

/**
 * Política de conflito: um bloqueio NÃO pode ser criado sobre sessões
 * confirmadas ou pendentes. O profissional precisa cancelar/reagendar antes.
 * Alternativa (não adotada): criar o bloqueio e marcar as sessões como
 * "reagendamento solicitado" automaticamente — mais rápido, porém dispara
 * mensagens aos pacientes sem revisão humana.
 */
export async function createBlockAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId, tz } = await ctx();
  const parsed = blockSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const b = parsed.data;

  const startsAt = dateTimeInTz(b.startDate, b.startTime, tz);
  const endsAt = dateTimeInTz(b.endDate, b.endTime, tz);
  if (endsAt <= startsAt) {
    return { fieldErrors: { endDate: ["O fim deve ser depois do início"] }, values: formValues(formData) };
  }

  const conflicts = await db.appointment.findMany({
    where: {
      professionalId,
      status: { in: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"] },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { startsAt: true, patient: { select: { name: true } } },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
  if (conflicts.length > 0) {
    const list = conflicts.map((c) => `${c.patient.name} (${formatDateTimeBR(c.startsAt, tz)})`).join(", ");
    return {
      error: `Há sessões neste período: ${list}. Cancele ou reagende antes de bloquear.`,
      values: formValues(formData),
    };
  }

  const block = await db.scheduleBlock.create({
    data: { professionalId, type: b.type, startsAt, endsAt, reason: b.reason },
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "scheduleBlock.create",
    entityType: "ScheduleBlock",
    entityId: block.id,
    after: block,
  });

  revalidatePath("/configuracoes/bloqueios");
  return { ok: true };
}

export async function deleteBlockAction(blockId: string) {
  const { actor, professionalId } = await ctx();
  const block = await db.scheduleBlock.findFirst({ where: { id: blockId, professionalId } });
  if (!block) throw new Error("Bloqueio não encontrado");

  await db.scheduleBlock.delete({ where: { id: blockId } });
  await audit(actor, {
    organizationId: actor.organizationId,
    action: "scheduleBlock.delete",
    entityType: "ScheduleBlock",
    entityId: blockId,
    before: block,
  });

  revalidatePath("/configuracoes/bloqueios");
}

export async function createExceptionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = exceptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const e = parsed.data;

  // @db.Date: guardamos meia-noite UTC da data civil, sem conversão de fuso.
  const exception = await db.scheduleException.create({
    data: {
      professionalId,
      date: new Date(`${e.date}T00:00:00Z`),
      startTime: e.startTime,
      endTime: e.endTime,
      note: e.note,
    },
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "scheduleException.create",
    entityType: "ScheduleException",
    entityId: exception.id,
    after: exception,
  });

  revalidatePath("/configuracoes/bloqueios");
  return { ok: true };
}

export async function deleteExceptionAction(exceptionId: string) {
  const { actor, professionalId } = await ctx();
  const exception = await db.scheduleException.findFirst({ where: { id: exceptionId, professionalId } });
  if (!exception) throw new Error("Horário excepcional não encontrado");

  await db.scheduleException.delete({ where: { id: exceptionId } });
  await audit(actor, {
    organizationId: actor.organizationId,
    action: "scheduleException.delete",
    entityType: "ScheduleException",
    entityId: exceptionId,
    before: exception,
  });

  revalidatePath("/configuracoes/bloqueios");
}

// ──────────────────────────────────────────────────────────────
// Políticas
// ──────────────────────────────────────────────────────────────

export async function updatePolicyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const before = await db.professionalPolicy.findUnique({ where: { professionalId } });
  const after = await db.professionalPolicy.upsert({
    where: { professionalId },
    create: { professionalId, ...parsed.data },
    update: parsed.data,
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "policy.update",
    entityType: "ProfessionalPolicy",
    entityId: after.id,
    before,
    after,
  });

  revalidatePath("/configuracoes/politicas");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// Retenção de dados (LGPD) — nível da organização, só OWNER
// ──────────────────────────────────────────────────────────────

export async function updateRetentionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (!canManageMembers(actor)) return { error: "Só o responsável pela organização altera a retenção." };
  const parsed = retentionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);

  const before = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { retentionYears: true } });
  await db.organization.update({ where: { id: actor.organizationId }, data: { retentionYears: parsed.data.retentionYears } });
  await audit(actor, { organizationId: actor.organizationId, action: "organization.retention", entityType: "Organization", entityId: actor.organizationId, before, after: parsed.data });
  revalidatePath("/configuracoes/politicas");
  return { ok: true };
}
