"use server";

import { revalidatePath } from "next/cache";
import { answerSurvey } from "@/lib/reports/service";
import { clientIp, rateLimit, retryMessage, RULES } from "@/lib/rate-limit";

export type SurveyState = { ok?: boolean; error?: string };

export async function answerSurveyAction(token: string, _prev: SurveyState, formData: FormData): Promise<SurveyState> {
  const ip = await clientIp();
  if (ip) {
    const r = await rateLimit(RULES.tokenActionIp, ip);
    if (!r.ok) return { error: retryMessage(r.retryAfterSeconds) };
  }
  const score = Number(formData.get("score"));
  if (!Number.isInteger(score) || score < 0 || score > 10) return { error: "Escolha uma nota de 0 a 10." };
  const comment = String(formData.get("comment") ?? "").trim().slice(0, 1000) || null;
  const ok = await answerSurvey(token, score, comment);
  if (!ok) return { error: "Esta pesquisa não está mais disponível." };
  revalidatePath(`/pesquisa/${token}`);
  return { ok: true };
}
