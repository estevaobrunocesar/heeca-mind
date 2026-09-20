import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redeemToken } from "@/lib/portal/service";
import { clientIp, rateLimit, RULES } from "@/lib/rate-limit";

/** Link mágico do WhatsApp: troca o token por sessão e manda para o portal do profissional. */
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const url = new URL(req.url);
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/+$/, "");
  const ip = await clientIp();
  if (ip) {
    const r = await rateLimit(RULES.tokenActionIp, ip);
    if (!r.ok) return new Response("Muitas tentativas. Aguarde alguns minutos.", { status: 429 });
  }
  if (token.length < 20) return NextResponse.redirect(new URL("/portal", origin));
  const s = await redeemToken(token, req.headers.get("user-agent"));
  if (!s) return NextResponse.redirect(new URL("/portal?invalid=1", origin));
  // Slug de entrada: o profissional que atende (ou o primeiro ativo da organização).
  const pro =
    (await db.professional.findFirst({ where: { organizationId: s.organizationId, isActive: true, appointments: { some: { patientId: s.patientId } } }, orderBy: { createdAt: "asc" }, select: { slug: true } })) ??
    (await db.professional.findFirst({ where: { organizationId: s.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { slug: true } }));
  return NextResponse.redirect(new URL(pro ? `/portal/${pro.slug}` : "/portal", origin));
}
