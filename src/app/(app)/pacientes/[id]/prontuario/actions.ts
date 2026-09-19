"use server";

import { revalidatePath } from "next/cache";
import { ClinicalAccessDenied, createNote, deleteNote } from "@/lib/clinical";
import { invalid, type FormState } from "@/lib/form";
import { requireActor } from "@/lib/session";
import { clinicalNoteSchema, deleteNoteSchema } from "@/lib/validation/clinical";

/**
 * Nada aqui passa por audit(): o conteúdo clínico não pode ir para o log
 * administrativo. O rastro é o ClinicalAccessLog, gravado em src/lib/clinical.ts.
 */

export async function createClinicalNoteAction(patientId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = clinicalNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  if (d.kind === "EVOLUTION" && !d.appointmentId) {
    return { fieldErrors: { appointmentId: ["Evolução precisa de uma sessão"] }, values: { kind: d.kind, content: d.content } };
  }
  try {
    await createNote(actor, { patientId, kind: d.kind, content: d.content, appointmentId: d.kind === "EVOLUTION" ? d.appointmentId : null });
  } catch (e) {
    if (e instanceof ClinicalAccessDenied) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Erro ao salvar", values: { kind: d.kind, content: d.content } };
  }
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deleteClinicalNoteAction(patientId: string, noteId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const parsed = deleteNoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    await deleteNote(actor, noteId, parsed.data.reason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao excluir" };
  }
  revalidatePath(`/pacientes/${patientId}/prontuario`);
  return { ok: true };
}
