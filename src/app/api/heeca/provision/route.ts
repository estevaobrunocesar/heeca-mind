import { NextResponse } from "next/server";
import type { Entitlement } from "@/lib/heeca/core";
import { platformEnabled, provision, verifyPortalRequest } from "@/lib/heeca/service";

/** Portal → Mind: cria o tenant da assinatura (idempotente). Contrato: heeca_site/docs/ENTITLEMENT.md */
export async function POST(req: Request) {
  if (!platformEnabled()) return NextResponse.json({ error: "integração com o portal desativada" }, { status: 503 });
  const raw = await req.text();
  const sig = verifyPortalRequest(raw, req.headers);
  if (!sig.ok) return NextResponse.json({ error: sig.error }, { status: 401 });
  try {
    const ent = JSON.parse(raw) as Entitlement;
    if (!ent?.subscriptionId) return NextResponse.json({ error: "subscriptionId ausente" }, { status: 400 });
    const t = await provision(ent);
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
    return NextResponse.json({ tenantId: t.tenantId, slug: t.slug, appUrl: `${base}/dashboard` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    console.error("[heeca] provision falhou:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
