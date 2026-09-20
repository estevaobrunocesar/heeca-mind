import { NextResponse } from "next/server";
import type { Entitlement } from "@/lib/heeca/core";
import { applyEntitlement, platformEnabled, verifyPortalRequest } from "@/lib/heeca/service";

/** Portal → Mind: mudança de plano/status. Só espelha; nunca cobra. */
export async function POST(req: Request) {
  if (!platformEnabled()) return NextResponse.json({ error: "integração com o portal desativada" }, { status: 503 });
  const raw = await req.text();
  const sig = verifyPortalRequest(raw, req.headers);
  if (!sig.ok) return NextResponse.json({ error: sig.error }, { status: 401 });
  try {
    const ent = JSON.parse(raw) as Entitlement;
    if (!ent?.subscriptionId) return NextResponse.json({ error: "subscriptionId ausente" }, { status: 400 });
    await applyEntitlement(ent);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    console.error("[heeca] entitlement falhou:", msg);
    // 404 para "não provisionado": o portal sabe que precisa chamar /provision.
    return NextResponse.json({ error: msg }, { status: /não provisionada/.test(msg) ? 404 : 500 });
  }
}
