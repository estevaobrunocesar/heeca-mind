import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

/**
 * Rate limit de janela fixa, persistido no Postgres.
 *
 * Por que Postgres e não memória: o app pode rodar em várias instâncias
 * (serverless) e memória zera a cada deploy. Redis seria mais rápido, mas
 * é uma dependência a mais para um punhado de formulários públicos.
 *
 * Semântica: até `limit` acertos por `windowSeconds`, contados a partir do
 * primeiro acerto da janela. Um único UPSERT atômico: duas requisições
 * simultâneas nunca "passam as duas" no limite.
 *
 * Chaves são sha256(scope:identifier) — IP e telefone não ficam em claro.
 */

export type RateLimitResult = {
  ok: boolean;
  /** Acertos restantes na janela (0 quando bloqueado). */
  remaining: number;
  /** Segundos até a janela reabrir. */
  retryAfterSeconds: number;
};

export type RateLimitRule = { scope: string; limit: number; windowSeconds: number };

function hashKey(scope: string, identifier: string): string {
  return createHash("sha256").update(`${scope}:${identifier}`).digest("hex");
}

export async function rateLimit(rule: RateLimitRule, identifier: string): Promise<RateLimitResult> {
  const key = hashKey(rule.scope, identifier);
  const window = rule.windowSeconds;

  // Se a janela expirou, reinicia com count=1; senão incrementa.
  const rows = await db.$queryRaw<Array<{ count: number; windowStart: Date }>>(Prisma.sql`
    INSERT INTO rate_limits ("key", "windowStart", "count")
    VALUES (${key}, now(), 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN rate_limits."windowStart" < now() - make_interval(secs => ${window}) THEN 1
        ELSE rate_limits."count" + 1
      END,
      "windowStart" = CASE
        WHEN rate_limits."windowStart" < now() - make_interval(secs => ${window}) THEN now()
        ELSE rate_limits."windowStart"
      END
    RETURNING "count", "windowStart"
  `);

  const { count, windowStart } = rows[0];
  const elapsed = (Date.now() - windowStart.getTime()) / 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil(window - elapsed));
  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds,
  };
}

/**
 * Aplica várias regras de uma vez (ex.: por IP e por telefone). Bloqueia se
 * qualquer uma estourar; devolve a maior espera.
 */
export async function rateLimitAll(checks: Array<{ rule: RateLimitRule; identifier: string | null }>): Promise<RateLimitResult> {
  const results = await Promise.all(checks.filter((c) => c.identifier).map((c) => rateLimit(c.rule, c.identifier!)));
  const blocked = results.filter((r) => !r.ok);
  if (blocked.length === 0) {
    return { ok: true, remaining: Math.min(...results.map((r) => r.remaining), Infinity), retryAfterSeconds: 0 };
  }
  return { ok: false, remaining: 0, retryAfterSeconds: Math.max(...blocked.map((r) => r.retryAfterSeconds)) };
}

/**
 * IP do cliente. Sem header de proxy (dev local, ou proxy mal configurado)
 * cai em "unknown": todos os anônimos dividem um balde — fecha o limite em
 * vez de desligá-lo. Fora de uma requisição (cron) devolve null.
 */
export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return fwd || h.get("x-real-ip") || "unknown";
  } catch {
    return null;
  }
}

export function retryMessage(seconds: number): string {
  if (seconds < 90) return `Muitas tentativas. Aguarde ${Math.max(1, Math.ceil(seconds / 10) * 10)} segundos.`;
  return `Muitas tentativas. Aguarde ${Math.ceil(seconds / 60)} minutos.`;
}

/** Remove janelas antigas. Chamado pelo cron. */
export async function purgeRateLimits(olderThanSeconds = 24 * 3600) {
  const r = await db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - olderThanSeconds * 1000) } } });
  return r.count;
}

// ──────────────────────────────────────────────────────────────
// Regras do produto
// ──────────────────────────────────────────────────────────────

export const RULES = {
  /** Envio do formulário público de agendamento. */
  publicBookingIp: { scope: "booking:ip", limit: 10, windowSeconds: 10 * 60 },
  publicBookingPhone: { scope: "booking:phone", limit: 3, windowSeconds: 60 * 60 },
  publicBookingProfessional: { scope: "booking:pro", limit: 60, windowSeconds: 60 * 60 },
  /** Ações por token (/confirmar): tokens são imprevisíveis; isto só barra varredura. */
  tokenActionIp: { scope: "token:ip", limit: 30, windowSeconds: 10 * 60 },
  /** Login: por IP e por e-mail, para não bloquear um escritório inteiro por um erro de senha. */
  loginIp: { scope: "login:ip", limit: 20, windowSeconds: 15 * 60 },
  loginEmail: { scope: "login:email", limit: 8, windowSeconds: 15 * 60 },
  /** Segundo fator: 6 dígitos são fáceis de chutar; por usuário. */
  mfaVerify: { scope: "mfa:user", limit: 10, windowSeconds: 15 * 60 },
  /** Recuperação de senha: evita spam de e-mail. */
  passwordResetIp: { scope: "reset:ip", limit: 5, windowSeconds: 60 * 60 },
} satisfies Record<string, RateLimitRule>;

/** Máximo de solicitações públicas ainda não confirmadas por número. */
export const MAX_PENDING_BOOKINGS_PER_PHONE = 2;
