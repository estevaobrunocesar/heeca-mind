/**
 * Integração com o portal heeca.com.br — parte PURA (sem banco, sem ambiente).
 * Contrato: heeca_site/docs/ENTITLEMENT.md. Testado em tests/heeca-core.test.ts.
 *
 *  - Chamadas servidor → servidor (provision/entitlement): HMAC-SHA256(secret, `${ts}.${rawBody}`)
 *    nos cabeçalhos X-Heeca-Timestamp / X-Heeca-Signature, janela de 5 min.
 *  - SSO (navegador): JWT HS256 com o mesmo segredo, `iss=heeca-portal`, `aud=<produto>`, 60 s.
 *
 * O mesmo esquema de HMAC é usado pelo Heeca Notify (um segredo por produto), por isso
 * `signBody`/`verifySignedBody` são compartilhados por src/lib/whatsapp/notify.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_MS = 5 * 60 * 1000;
export const PRODUCT = "mind";

export type Entitlement = {
  subscriptionId: string;
  accountId: string;
  product: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
  access: "ok" | "warning" | "blocked";
  plan: { code: string; name: string; features: string[]; limits: Record<string, unknown> };
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  account: { name: string; tradeName: string | null; document: string | null; email: string; phone: string | null };
  owner?: { name: string; email: string };
  segment?: string | null;
};

export type SsoClaims = { email: string; name: string; tenantId: string | null; subscriptionId: string; role: string; jti: string; exp: number };

// ── HMAC ──────────────────────────────────────────────────────────────────────

export function signBody(secret: string, rawBody: string, ts = Date.now()): { ts: string; sig: string } {
  return { ts: String(ts), sig: createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex") };
}

export type SignatureCheck = { ok: true } | { ok: false; error: string };

export function verifySignedBody(secret: string, rawBody: string, headers: { ts: string | null; sig: string | null }, now = Date.now()): SignatureCheck {
  if (!secret) return { ok: false, error: "segredo não configurado" };
  const ts = headers.ts ?? "";
  const sig = headers.sig ?? "";
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > MAX_SKEW_MS) return { ok: false, error: "assinatura expirada" };
  const expected = signBody(secret, rawBody, Number(ts)).sig;
  if (sig.length !== expected.length || !/^[0-9a-f]+$/i.test(sig)) return { ok: false, error: "assinatura inválida" };
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return { ok: false, error: "assinatura inválida" };
  return { ok: true };
}

// ── JWT HS256 (só o que o SSO precisa) ────────────────────────────────────────

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
const fromB64url = (s: string) => Buffer.from(s, "base64url");

export function signHs256Jwt(secret: string, payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export type JwtCheck = { ok: true; claims: SsoClaims } | { ok: false; error: string };

/**
 * Valida assinatura, `alg`, `iss`, `aud`, `exp` (tolerância de 30 s) e extrai as claims do SSO.
 * O `jti` é devolvido para o chamador rejeitar reuso (tabela de uso único no serviço).
 */
export function verifySsoJwt(secret: string, token: string, opts: { audience?: string; nowMs?: number } = {}): JwtCheck {
  if (!secret) return { ok: false, error: "segredo não configurado" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, error: "token malformado" };
  const [head, body, sig] = parts;
  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(fromB64url(head).toString("utf8"));
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return { ok: false, error: "token malformado" };
  }
  if (header.alg !== "HS256") return { ok: false, error: "algoritmo não suportado" };
  const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
  const given = fromB64url(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, error: "assinatura inválida" };

  const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!exp || now > exp + 30) return { ok: false, error: "token expirado" };
  if (payload.iss !== "heeca-portal") return { ok: false, error: "emissor inválido" };
  const aud = opts.audience ?? PRODUCT;
  const audOk = Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud;
  if (!audOk) return { ok: false, error: "token de outro produto" };
  if (typeof payload.sub !== "string" || !payload.sub.includes("@")) return { ok: false, error: "token sem e-mail" };
  if (typeof payload.jti !== "string" || payload.jti.length < 8) return { ok: false, error: "token sem jti" };

  return {
    ok: true,
    claims: {
      email: payload.sub.trim().toLowerCase(),
      name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : payload.sub,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
      subscriptionId: typeof payload.subscriptionId === "string" ? payload.subscriptionId : "",
      role: typeof payload.role === "string" ? payload.role : "MEMBER",
      jti: payload.jti,
      exp,
    },
  };
}

// ── Mapeamentos puros ────────────────────────────────────────────────────────

export type AccessState = "OK" | "WARNING" | "BLOCKED";

export function accessStateOf(e: Pick<Entitlement, "access" | "status">): AccessState {
  if (e.access === "blocked") return "BLOCKED";
  if (e.access === "warning") return "WARNING";
  // Defesa: status terminal sem `access` coerente nunca deixa o app aberto.
  if (e.status === "SUSPENDED" || e.status === "CANCELED") return "BLOCKED";
  return "OK";
}

/** Papel do portal → papel local. */
export function membershipRoleFor(portalRole: string): "OWNER" | "RECEPTIONIST" | "FINANCE" {
  if (portalRole === "OWNER" || portalRole === "ADMIN") return "OWNER";
  if (portalRole === "BILLING") return "FINANCE";
  return "RECEPTIONIST";
}

/** Só caminhos relativos internos; nada de `//evil.com` nem esquemas. */
export function safeNextPath(next: string | null | undefined, fallback = "/dashboard"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /^\/(sso|api)\b/.test(next)) return fallback;
  return next;
}

/** Limite numérico do plano (ex.: maxProfessionals). Ausente ou inválido = sem limite. */
export function planLimit(limits: unknown, key: string): number | null {
  if (!limits || typeof limits !== "object") return null;
  const v = (limits as Record<string, unknown>)[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
