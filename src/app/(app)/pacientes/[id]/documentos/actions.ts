"use server";

import { revalidatePath } from "next/cache";
import { DocumentError, revokeDocument, sendDocument } from "@/lib/documents/service";
import { type FormState } from "@/lib/form";
import { requireActor } from "@/lib/session";

export async function sendDocumentAction(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const templateId = String(formData.get("templateId") ?? "");
  const appointmentId = String(formData.get("appointmentId") ?? "") || null;
  if (!templateId) return { error: "Escolha o documento." };
  try {
    const r = await sendDocument(actor, { templateId, patientId, appointmentId });
    revalidatePath(`/pacientes/${patientId}`);
    if (appointmentId) revalidatePath(`/agenda/${appointmentId}`);
    return { ok: true, error: r.missing.length ? `Enviado. Atenção: sem valor para ${r.missing.map((m) => `{{${m}}}`).join(", ")} (aparece como “—”).` : undefined };
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message };
    throw e;
  }
}

export async function revokeDocumentAction(requestId: string, patientId: string, reason: string) {
  const actor = await requireActor();
  await revokeDocument(actor, requestId, reason || "cancelado pelo profissional");
  revalidatePath(`/pacientes/${patientId}`);
}
