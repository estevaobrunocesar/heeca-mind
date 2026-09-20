"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { canManagePatients } from "@/lib/permissions";
import { revokePatientSessions } from "@/lib/portal/service";
import { requireActor } from "@/lib/session";
import { assertPatientInTenant } from "@/lib/tenant";

export async function revokePortalSessionsAction(patientId: string) {
  const actor = await requireActor();
  if (!canManagePatients(actor)) throw new Error("Sem permissão");
  await assertPatientInTenant(actor, patientId);
  const n = await revokePatientSessions(patientId);
  await audit(actor, { organizationId: actor.organizationId, action: "portal.sessions_revoked", entityType: "Patient", entityId: patientId, after: { count: n } });
  revalidatePath(`/pacientes/${patientId}`);
}
