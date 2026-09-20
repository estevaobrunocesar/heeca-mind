"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { acceptDocument, DocumentError } from "@/lib/documents/service";
import { clientIp, rateLimit, retryMessage, RULES } from "@/lib/rate-limit";

export type AcceptState = { ok?: boolean; error?: string; values?: { name?: string } };

/** Aceite pelo link (uso único). O token é a credencial; o nome digitado precisa conferir com o cadastro. */
export async function acceptDocumentAction(token: string, _prev: AcceptState, formData: FormData): Promise<AcceptState> {
  const ip = await clientIp();
  if (ip) {
    const r = await rateLimit(RULES.tokenActionIp, ip);
    if (!r.ok) return { error: retryMessage(r.retryAfterSeconds) };
  }
  const name = String(formData.get("name") ?? "").trim();
  const agreed = formData.get("agree") === "on";
  if (name.length < 3) return { error: "Digite seu nome completo.", values: { name } };
  if (!agreed) return { error: "Marque a caixa confirmando que leu e aceita.", values: { name } };
  try {
    await acceptDocument(token, name, (await headers()).get("user-agent"));
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message, values: { name } };
    throw e;
  }
  revalidatePath(`/documento/${token}`);
  return { ok: true };
}
