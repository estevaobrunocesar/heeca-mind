import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processWebhookEvents } from "@/lib/whatsapp/dispatcher";
import { extractWebhookEvents, verifyMetaSignature } from "@/lib/whatsapp/signature";

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

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  // Um payload pode conter vários eventos; cada um vira uma linha com id
  // único para deduplicação (a Meta reenvia em caso de dúvida).
  const events = extractWebhookEvents(body);

  if (events.length > 0) {
    await db.whatsAppWebhookEvent.createMany({
      data: events.map((e) => ({ eventId: e.eventId, payload: e.payload as object })),
      skipDuplicates: true,
    });
  }

  // Processa já (operações rápidas de banco). O cron reprocessa o que sobrar.
  if (events.length > 0) {
    try {
      await processWebhookEvents();
    } catch (err) {
      console.error("[whatsapp webhook] processamento falhou; o cron tentará de novo", err);
    }
  }
  return NextResponse.json({ received: events.length });
}
