import { NextResponse } from "next/server";
import { verifySignedBody } from "@/lib/heeca/core";
import { db } from "@/lib/db";
import { notifyProduct, notifySecret } from "@/lib/whatsapp/notify";
import { processWebhookEvents } from "@/lib/whatsapp/dispatcher";
import { inboundToWebhookEvent, type NotifyInboundEvent } from "@/lib/whatsapp/inbound";

/**
 * Callback do Heeca Notify: status de entrega e respostas do paciente (botão ou texto).
 * Assinado com o mesmo segredo do envio. Estratégia igual à do webhook antigo da Meta:
 * validar, persistir o evento bruto (dedupe por id), responder 2xx rápido, processar depois.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if ((req.headers.get("x-heeca-product") ?? "").toLowerCase() !== notifyProduct()) return NextResponse.json({ error: "produto" }, { status: 401 });
  const sig = verifySignedBody(notifySecret(), raw, { ts: req.headers.get("x-heeca-timestamp"), sig: req.headers.get("x-heeca-signature") });
  if (!sig.ok) return NextResponse.json({ error: sig.error }, { status: 401 });

  let ev: NotifyInboundEvent;
  try {
    ev = JSON.parse(raw) as NotifyInboundEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const mapped = inboundToWebhookEvent(ev);
  if (!mapped) return NextResponse.json({ received: 0 });

  await db.whatsAppWebhookEvent.createMany({ data: [{ eventId: mapped.eventId, payload: mapped.payload as object }], skipDuplicates: true });
  try {
    await processWebhookEvents();
  } catch (err) {
    console.error("[notify webhook] processamento falhou; o cron tentará de novo", err);
  }
  return NextResponse.json({ received: 1 });
}
