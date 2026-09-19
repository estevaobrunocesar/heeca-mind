"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canDeletePatient } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { assertPatientInTenant } from "@/lib/tenant";
import { patientSchema } from "@/lib/validation/patient";

/** WhatsApp é único por organização — evita dois cadastros da mesma pessoa. */
async function whatsappTaken(organizationId: string, whatsapp: string, exceptId?: string) {
  return db.patient.findFirst({
    where: { organizationId, whatsapp, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true, deletedAt: true },
  });
}

export async function createPatientAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
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

  const patient = await db.patient.create({
    data: { organizationId: actor.organizationId, ...d, whatsapp: d.whatsapp! },
  });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.create", entityType: "Patient", entityId: patient.id, after: patient });

  revalidatePath("/pacientes");
  redirect(`/pacientes/${patient.id}`);
}

export async function updatePatientAction(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  await assertPatientInTenant(actor, patientId);
  const parsed = patientSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const dup = await whatsappTaken(actor.organizationId, d.whatsapp!, patientId);
  if (dup) return { fieldErrors: { whatsapp: [`Este número já é de ${dup.name}.`] }, values: formValues(formData) };

  const before = await db.patient.findUniqueOrThrow({ where: { id: patientId } });
  const after = await db.patient.update({ where: { id: patientId }, data: { ...d, whatsapp: d.whatsapp! } });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.update", entityType: "Patient", entityId: patientId, before, after });

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
  redirect(`/pacientes/${patientId}`);
}

/**
 * Exclusão lógica (LGPD). O cadastro sai das listas e da busca, mas o
 * histórico administrativo é preservado pelo prazo de retenção — a
 * anonimização definitiva é um job futuro. Bloqueada se houver sessões
 * futuras ativas: cancele-as antes.
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
  await audit(actor, { organizationId: actor.organizationId, action: "patient.delete", entityType: "Patient", entityId: patientId });

  revalidatePath("/pacientes");
  redirect("/pacientes?deleted=1");
}

export async function restorePatientAction(patientId: string) {
  const actor = await requireActor();
  if (!canDeletePatient(actor)) throw new Error("Sem permissão");
  const p = await db.patient.findFirst({ where: { id: patientId, organizationId: actor.organizationId }, select: { id: true } });
  if (!p) throw new Error("Paciente não encontrado");

  await db.patient.update({ where: { id: patientId }, data: { deletedAt: null, followUpStatus: "ACTIVE" } });
  await audit(actor, { organizationId: actor.organizationId, action: "patient.restore", entityType: "Patient", entityId: patientId });

  revalidatePath("/pacientes");
  revalidatePath(`/pacientes/${patientId}`);
}
