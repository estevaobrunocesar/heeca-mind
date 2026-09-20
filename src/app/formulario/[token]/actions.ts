"use server";

import { revalidatePath } from "next/cache";
import { FormError, loadRequestByToken, submitAnswers } from "@/lib/forms";
import { validateAnswers } from "@/lib/forms-schema";
import { clientIp, rateLimit, retryMessage, RULES } from "@/lib/rate-limit";

export type SubmitState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; values?: Record<string, string | string[]> };

/**
 * Resposta do paciente. O token é a credencial (uso único). As respostas
 * são validadas contra o SNAPSHOT dos campos, nunca contra o modelo atual.
 */
export async function submitFormAction(token: string, _prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const ip = await clientIp();
  if (ip) {
    const r = await rateLimit(RULES.tokenActionIp, ip);
    if (!r.ok) return { error: retryMessage(r.retryAfterSeconds) };
  }
  const req = await loadRequestByToken(token);
  if (!req || req.status !== "PENDING" || req.expired) return { error: "Este link não está mais válido." };

  // FormData → raw (multi_choice vira array)
  const raw: Record<string, string | string[]> = {};
  for (const f of req.fields) {
    const all = formData.getAll(f.id).map(String);
    raw[f.id] = f.type === "multi_choice" ? all : (all[0] ?? "");
  }
  const { answers, errors } = validateAnswers(req.fields, raw);
  if (Object.keys(errors).length > 0) return { fieldErrors: errors, values: raw };

  try {
    await submitAnswers(token, answers);
  } catch (e) {
    if (e instanceof FormError) return { error: e.message, values: raw };
    throw e;
  }
  revalidatePath(`/formulario/${token}`);
  return { ok: true };
}
