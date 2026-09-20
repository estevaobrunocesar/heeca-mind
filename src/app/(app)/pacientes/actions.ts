"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canDeletePatient, canManagePatients } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { assertPatientInTenant } from "@/lib/tenant";
import { patientSchema, splitPatientInput } from "@/lib/validation/patient";
import { anonymizePatient } from "@/lib/lgpd/anonymize";
import { Prisma } from "@/generated/prisma/client";

/**
 * Tags são administrativas e por organização: upsert por nome, e o vínculo do paciente vira
 * exatamente a lista enviada (remove as que saíram). Tags órfãs ficam — servem de sugestão.
 */
async function syncPatientTags(tx: Prisma.TransactionClient, organizationId: string, patientId: string, names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const t = await tx.tag.upsert({ where: { organizationId_name: { organizationId, name } }, update: {}, create: { organizationId, name }, select: { id: true } });
    ids.push(t.id);
  }
  await tx.patientTag.deleteMany({ where: { patientId, tagId: { notIn: ids } } });
  await tx.patientTag.createMany({ data: ids.map((tagId) => ({ patientId, tagId })), skipDuplicates: true });
}

/** WhatsApp é único por organização — evita dois cadastros da mesma pessoa. */
async function whatsappTaken(organizationId: string, whatsapp: string, exceptId?: string) {
  return db.patient.findFirst({
    where: { organizationId, whatsapp, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, deletedAt: true },
  });
}

export async function createPatientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (!canManagePatients(actor)) return { error: "Sem permissão para cadastrar pacientes." };
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const dup = await whatsappTaken(actor.organizationId, d.whatsapp!);
  if (dup) {
    return {
      fieldErrors: { whatsapp: [dup.deletedAt ? "Este número pertence a um paciente excluído. Restaure-o em vez de recriar." : `Este número já é de ${dup.name}.`] },
      values: formValues(formData),
    };
  }

  const { columns, commsPrefs, tags } = splitPatientInput(d);
  const patient = await db.$transaction(async (tx) => {
    const p = await tx.patient.create({ data: { organizationId: actor.organizationId, ...columns, whatsapp: columns.whatsapp!, commsPrefs: commsPrefs ?? Prisma.JsonNull } });
    await syncPatientTags(tx, actor.organizationId, p.id, tags);
    return p;
  });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.create", entityType: "Patient", entityId: patient.id, after: { ...patient, tags } });

  revalidatePath("/pacientes");
  redirect(`/pacientes/${patient.id}`);
}

export async function updatePatientAction(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (!canManagePatients(actor)) return { error: "Sem permissão para editar pacientes." };
  await assertPatientInTenant(actor, patientId);
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const dup = await whatsappTaken(actor.organizationId, d.whatsapp!, patientId);
  if (dup) return { fieldErrors: { whatsapp: [`Este número já é de ${dup.name}.`] }, values: formValues(formData) };

  const { columns, commsPrefs, tags } = splitPatientInput(d);
  const before = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
  const after = await db.$transaction(async (tx) => {
    const p = await tx.patient.update({ where: { id: patientId }, data: { ...columns, whatsapp: columns.whatsapp!, commsPrefs: commsPrefs ?? Prisma.JsonNull } });
    await syncPatientTags(tx, actor.organizationId, patientId, tags);
    return p;
  });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.update", entityType: "Patient", entityId: patientId, before, after: { ...after, tags } });

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}`);
}

/**
 * Exclusão lógica (LGPD). O cadastro sai das listas e da busca, mas o
 * histórico administrativo é preservado pelo prazo de retenção; depois, o
 * job em src/lib/lgpd/anonymize.ts anonimiza de forma irreversível.
 * Bloqueada se houver sessões futuras ativas: cancele-as antes.
 */
export async function deletePatientAction(patientId: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  if (!canDeletePatient(actor)) return { error: "Sem permissão para excluir pacientes." };
  await assertPatientInTenant(actor, patientId);

  const upcoming = await db.appointment.count({
    where: { patientId, startsAt: { gt: new Date() }, status: { in: [...ACTIVE_STATUSES] } },
  });
  if (upcoming > 0) return { error: `Há ${upcoming} sessão(ões) futura(s) ativa(s). Cancele-as antes de excluir.` };

  await db.patient.update({ where: { id: patientId }, data: { deletedAt: new Date(), followUpStatus: "INACTIVE" } });
  await db.recurringSeries.updateMany({ where: { patientId, isActive: true }, data: { isActive: false } });
  await db.waitlistEntry.updateMany({ where: { patientId, status: "WAITING" }, data: { status: "REMOVED", removedReason: "Cadastro excluído", resolvedAt: new Date() } });
  await db.formRequest.updateMany({ where: { patientId, status: "PENDING" }, data: { status: "CANCELLED" } });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.delete", entityType: "Patient", entityId: patientId });

  revalidatePath("/pacientes");
  redirect("/pacientes?deleted=1");
}

export async function restorePatientAction(patientId: string) {
  const actor = await requireActor();
  if (!canDeletePatient(actor)) throw new Error("Sem permissão");
  const p = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId }, select: { id: true, anonymizedAt: true } });
  if (!p) throw new Error("Paciente não encontrado");
  if (p.anonymizedAt) throw new Error("Cadastro anonimizado não pode ser restaurado");

  await db.patient.update({ where: { id: patientId }, data: { deletedAt: null, followUpStatus: "ACTIVE" } });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.restore", entityType: "Patient", entityId: patientId });

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
}

/**
 * Anonimização manual, antes do prazo — a pedido do titular (LGPD art. 18, VI).
 * Irreversível. Exige que o cadastro já esteja excluído, como dupla confirmação.
 */
export async function anonymizePatientNowAction(patientId: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  if (!canDeletePatient(actor)) return { error: "Sem permissão." };
  const p = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId }, select: { deletedAt: true, anonymizedAt: true } });
  if (!p) return { error: "Paciente não encontrado." };
  if (p.anonymizedAt) return { error: "Já anonimizado." };
  if (!p.deletedAt) return { error: "Exclua o cadastro antes de anonimizar." };

  await anonymizePatient(patientId, "manual");
  await audit(actor, { organizationId: actor.organizationId, action: "patient.anonymize_manual", entityType: "Patient", entityId: patientId });
  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  return {};
}
