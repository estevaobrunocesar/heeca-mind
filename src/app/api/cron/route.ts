import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCron } from "@/lib/whatsapp/dispatcher";

/**
 * Cron de notificações. Chamar a cada minuto:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron
 * Vercel Cron envia esse header automaticamente quando CRON_SECRET existe.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const result = await runCron();
  return NextResponse.json(result);
}

export const POST = GET;
