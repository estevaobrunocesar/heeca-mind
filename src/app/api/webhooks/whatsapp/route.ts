import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Webhook da Meta Cloud API.
 *
 * GET  — handshake de verificação (hub.challenge).
 * POST — eventos: status de entrega (sent/delivered/read/failed) e mensagens
 *        recebidas (ex.: paciente respondendo "confirmar").
 *
 * Estratégia: validar assinatura, persistir o evento bruto e responder 200
 * imediatamente. O processamento acontece depois (processWebhookEvent), para
 * a Meta não reenviar por timeout.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = header.slice("sha256=".length);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

type MetaWebhookBody = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{ id: string; status: string; timestamp: string }>;
        messages?: Array<{ id: string; from: string; type: string }>;
      };
    }>;
  }>;
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Um payload pode conter vários eventos; cada um vira uma linha com id
  // único para deduplicação (a Meta reenvia em caso de dúvida).
  const events: Array<{ eventId: string; payload: unknown }> = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) {
        events.push({ eventId: `status:${s.id}:${s.status}`, payload: s });
      }
      for (const m of change.value?.messages ?? []) {
        events.push({ eventId: `message:${m.id}`, payload: m });
      }
    }
  }

  if (events.length > 0) {
    await db.whatsAppWebhookEvent.createMany({
      data: events.map((e) => ({ eventId: e.eventId, payload: e.payload as object })),
      skipDuplicates: true,
    });
  }

  // TODO(módulo 7): enfileirar processWebhookEvent para atualizar
  // Notification.status e tratar respostas do paciente.
  return NextResponse.json({ received: events.length });
}
