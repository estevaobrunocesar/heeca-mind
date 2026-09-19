import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Valida o header X-Hub-Signature-256 da Meta: "sha256=" + HMAC-SHA256 do
 * corpo bruto com o App Secret. Comparação em tempo constante.
 */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function signMetaBody(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Extrai eventos individuais do payload da Meta com um id estável para
 * deduplicação (a Meta reenvia quando não recebe 200 a tempo).
 */
export function extractWebhookEvents(body: unknown): Array<{ eventId: string; payload: unknown }> {
  const out: Array<{ eventId: string; payload: unknown }> = [];
  const entries = (body as { entry?: Array<{ changes?: Array<{ value?: { statuses?: Array<{ id: string; status: string }>; messages?: Array<{ id: string }> } }> }> })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) out.push({ eventId: `status:${s.id}:${s.status}`, payload: s });
      for (const m of change.value?.messages ?? []) out.push({ eventId: `message:${m.id}`, payload: m });
    }
  }
  return out;
}
