"use server";

import { revalidatePath } from "next/cache";
import { sendReactivation } from "@/lib/reports/service";
import { requireActor } from "@/lib/session";

export async function sendReactivationAction(professionalId: string, patientId: string): Promise<{ error?: string }> {
  const actor = await requireActor();
  try {
    await sendReactivation(actor, professionalId, patientId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível enviar." };
  }
  revalidatePath("/pacientes/reativacao");
  return {};
}
