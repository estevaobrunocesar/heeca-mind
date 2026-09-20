"use server";

import { revalidatePath } from "next/cache";
import { cancelFormRequest, FormError, sendForm } from "@/lib/forms";
import { requireActor } from "@/lib/session";

export async function sendFormAction(patientId: string, templateId: string, appointmentId: string | null): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  try {
    const r = await sendForm(actor, { templateId, patientId, appointmentId });
    revalidatePath(`/pacientes/${patientId}`);
    if (appointmentId) revalidatePath(`/agenda/${appointmentId}`);
    return { ok: true, message: r.resent ? "Reenviado com um novo link." : "Enviado pelo WhatsApp." };
  } catch (e) {
    if (e instanceof FormError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function cancelFormRequestAction(patientId: string, requestId: string): Promise<{ ok: boolean; message: string }> {
  const actor = await requireActor();
  try {
    await cancelFormRequest(actor, requestId);
    revalidatePath(`/pacientes/${patientId}`);
    return { ok: true, message: "Pedido cancelado." };
  } catch (e) {
    if (e instanceof FormError) return { ok: false, message: e.message };
    throw e;
  }
}
