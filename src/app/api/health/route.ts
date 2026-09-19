import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Healthcheck para load balancer / uptime monitor / docker healthcheck.
 * Sem autenticação e sem dados sensíveis: só "estou de pé e alcanço o banco".
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
      version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    });
  } catch (err) {
    return NextResponse.json({ status: "degraded", db: "unreachable", error: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
