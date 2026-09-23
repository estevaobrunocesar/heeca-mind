import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PRODUCT } from "@/lib/heeca/core";

/**
 * Healthcheck para load balancer / uptime monitor / docker healthcheck.
 * Sem autenticação e sem dados sensíveis: só "estou de pé e alcanço o banco".
 *
 * `product` identifica QUAL produto Heeca responde nesta porta. Todo produto tem esta rota, então
 * "responde 200 no health" não distingue um do outro: nesta máquina várias sessões sobem servidor
 * e uma suíte já dirigiu o app de outro produto sem perceber. O global-setup do E2E confere aqui.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      product: PRODUCT,
      db: "ok",
      latencyMs: Date.now() - startedAt,
      version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    });
  } catch (err) {
    return NextResponse.json({ status: "degraded", product: PRODUCT, db: "unreachable", error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
