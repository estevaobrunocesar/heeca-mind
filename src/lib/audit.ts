import "server-only";
import { headers } from "next/headers";
import { db } from "./db";
import type { Actor } from "./permissions";

/**
 * IP da requisição atual, ou null fora de uma (cron, scripts, webhook
 * processado em background). headers() lança nesses contextos.
 */
async function requestIp(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

type JsonValue = Parameters<typeof db.auditLog.create>[0]["data"]["before"];

/**
 * Registra uma alteração em entidade de negócio.
 *
 * Convenção de `action`: "<entidade>.<verbo>" — ex.: "appointment.confirm",
 * "service.update", "patient.delete". Filtrável no futuro painel de auditoria.
 */
export async function audit(
  actor: Actor | null,
  params: {
    organizationId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  },
) {
  const ip = await requestIp();

  await db.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: actor?.userId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: (params.before ?? undefined) as JsonValue,
      after: (params.after ?? undefined) as JsonValue,
      ip,
    },
  });
}
