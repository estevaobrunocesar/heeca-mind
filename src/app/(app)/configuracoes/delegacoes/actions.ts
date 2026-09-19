"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { ClinicalAccessDenied, grantDelegation, revokeDelegation } from "@/lib/clinical";
import { validateDelegationWindow } from "@/lib/clinical-delegation";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form";
import { requireActor } from "@/lib/session";
import { dateTimeInTz } from "@/lib/time";
import { delegationSchema, revokeDelegationSchema } from "@/lib/validation/clinical";

/**
 * Delegar e revogar SÃO auditados (audit_logs): são atos administrativos —
 * quem, para quem, qual paciente, por quanto tempo. Nenhum conteúdo clínico
 * passa por aqui.
 */

export async function grantDelegationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = delegationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const values = { delegateProfessionalId: d.delegateProfessionalId, patientId: d.patientId ?? "", kind: d.kind, reason: d.reason, startsOn: d.startsOn, endsOn: d.endsOn };

  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  // Início 00:00 do dia inicial; fim 23:59:59 do dia final, no fuso da organização.
  const startsAt = dateTimeInTz(d.startsOn, "00:00", org.timezone);
  const expiresAt = new Date(dateTimeInTz(d.endsOn, "23:59", org.timezone).getTime() + 59_000);
  const windowError = validateDelegationWindow(startsAt, expiresAt);
  if (windowError) return { fieldErrors: { endsOn: [windowError] }, values };

  let id: string;
  try {
    id = await grantDelegation(actor, { delegateProfessionalId: d.delegateProfessionalId, patientId: d.patientId, kind: d.kind, reason: d.reason, startsAt, expiresAt });
  } catch (e) {
    if (e instanceof ClinicalAccessDenied) return { error: e.message, values };
    return { error: e instanceof Error ? e.message : "Erro ao delegar", values };
  }
  await audit(actor, {
    organizationId: actor.organizationId,
    action: "clinical_delegation.grant",
    entityType: "ClinicalDelegation",
    entityId: id,
    after: { delegateProfessionalId: d.delegateProfessionalId, patientId: d.patientId, kind: d.kind, startsAt, expiresAt },
  });
  revalidatePath("/configuracoes/delegacoes");
  return { ok: true };
}

export async function revokeDelegationAction(delegationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = revokeDelegationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    await revokeDelegation(actor, delegationId, parsed.data.reason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao revogar" };
  }
  await audit(actor, { organizationId: actor.organizationId, action: "clinical_delegation.revoke", entityType: "ClinicalDelegation", entityId: delegationId, after: { reason: parsed.data.reason } });
  revalidatePath("/configuracoes/delegacoes");
  revalidatePath("/pacientes");
  return { ok: true };
}
