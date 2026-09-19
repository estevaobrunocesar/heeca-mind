import "server-only";
import { db } from "./db";

/**
 * Sessões de login (uma por `sid` do JWT).
 *
 * O JWT continua sendo a credencial — o que esta tabela acrescenta é o
 * direito de revogá-lo antes de expirar. `assertActive` é chamado por
 * requireActor()/getActor() em toda requisição autenticada; é uma busca por
 * chave primária, mais barata que qualquer query de página.
 */

export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // igual a authConfig.session.maxAge
const TOUCH_INTERVAL_MS = 5 * 60 * 1000; // grava lastSeenAt no máximo a cada 5 min

export type RevokeReason = "user" | "password_reset" | "mfa_enabled" | "admin";

export async function createUserSession(input: { sid: string; userId: string; ip: string | null; userAgent: string | null }) {
  await db.userSession.create({
    data: { ...input, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) },
  });
}

/**
 * true se a sessão existe, não foi revogada e não expirou. Sessões sem linha
 * (JWT emitido antes desta tabela existir) são consideradas inválidas —
 * força um novo login uma única vez após o deploy.
 */
export async function assertActive(sid: string, userId: string): Promise<boolean> {
  const s = await db.userSession.findUnique({ where: { sid }, select: { userId: true, revokedAt: true, expiresAt: true, lastSeenAt: true } });
  if (!s || s.userId !== userId || s.revokedAt || s.expiresAt < new Date()) return false;
  if (Date.now() - s.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    // Melhor esforço: não bloqueia a requisição se falhar.
    db.userSession.update({ where: { sid }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return true;
}

export async function listActiveSessions(userId: string) {
  return db.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { sid: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
  });
}

export async function revokeSession(sid: string, userId: string, reason: RevokeReason) {
  const r = await db.userSession.updateMany({
    where: { sid, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return r.count > 0;
}

/** Revoga todas as sessões do usuário, exceto opcionalmente a atual. */
export async function revokeAllSessions(userId: string, reason: RevokeReason, exceptSid?: string) {
  const r = await db.userSession.updateMany({
    where: { userId, revokedAt: null, ...(exceptSid ? { sid: { not: exceptSid } } : {}) },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return r.count;
}

/** Cron: apaga expiradas e revogadas antigas (30 dias bastam para auditoria). */
export async function purgeSessions() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const r = await db.userSession.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return r.count;
}

/** "Chrome · Windows" a partir do User-Agent — só para exibição. */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return "Dispositivo desconhecido";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : null;
  return [browser, os].filter(Boolean).join(" · ") || "Dispositivo desconhecido";
}
