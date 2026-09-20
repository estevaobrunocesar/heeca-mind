import "dotenv/config";
import { randomUUID } from "node:crypto";
import { signBody, signHs256Jwt, type Entitlement } from "../src/lib/heeca/core";

/**
 * Simula o portal Heeca e o Heeca Notify contra o servidor local (docs/mind/07-TESTES.md §2).
 *
 *   npm run heeca:sim -- provision [email] [segment]      cria a assinatura sub_sim_<email> (idempotente)
 *   npm run heeca:sim -- entitlement <subscriptionId> <ok|warning|blocked> [planCode]
 *   npm run heeca:sim -- sso <subscriptionId> <email> [role]   imprime a URL de /sso/heeca para abrir no navegador
 *   npm run heeca:sim -- notify status <providerMessageId> <sent|delivered|read|failed> [tenantId] [ref]
 *   npm run heeca:sim -- notify button <telefone> <confirm|reschedule|cancel>:<token> [providerMessageId]
 *   npm run heeca:sim -- notify text <telefone> "sim"
 *
 * Variáveis: HEECA_PLATFORM_SECRET (portal) e NOTIFY_SECRET (Notify) do .env; BASE_URL para outra porta.
 */
const [cmd, ...args] = process.argv.slice(2);
const base = (process.env.BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function need(name: string): string {
  const v = process.env[name];
  if (!v || v.length < 16) throw new Error(`${name} não definido (≥ 16 caracteres) no .env`);
  return v;
}

async function postSigned(path: string, secret: string, body: unknown, extra: Record<string, string> = {}) {
  const raw = JSON.stringify(body);
  const { ts, sig } = signBody(secret, raw);
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Heeca-Timestamp": ts, "X-Heeca-Signature": sig, ...extra }, body: raw });
  console.log(res.status, await res.text());
}

function entitlement(subscriptionId: string, email: string, access: Entitlement["access"], planCode = "solo", segment?: string): Entitlement {
  const status: Entitlement["status"] = access === "blocked" ? "SUSPENDED" : access === "warning" ? "PAST_DUE" : "TRIALING";
  return {
    subscriptionId,
    accountId: `acc_${subscriptionId}`,
    product: "mind",
    status,
    access,
    plan: { code: planCode, name: planCode, features: [], limits: { maxProfessionals: planCode === "solo" ? 1 : 10 } },
    trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    currentPeriodEnd: null,
    account: { name: "Consultório Simulado", tradeName: null, document: "12345678901", email, phone: "+5511999990000" },
    owner: { name: "Profissional Simulado", email },
    segment: segment ?? null,
  };
}

async function main() {
  switch (cmd) {
    case "provision": {
      const email = args[0] ?? "sim@exemplo.com";
      const sub = `sub_sim_${email.replace(/[^a-z0-9]/gi, "_")}`;
      await postSigned("/api/heeca/provision", need("HEECA_PLATFORM_SECRET"), entitlement(sub, email, "ok", "solo", args[1]));
      console.log("subscriptionId:", sub);
      return;
    }
    case "entitlement": {
      const [sub, access = "ok", plan] = args;
      if (!sub) throw new Error("uso: entitlement <subscriptionId> <ok|warning|blocked> [planCode]");
      await postSigned("/api/heeca/entitlement", need("HEECA_PLATFORM_SECRET"), entitlement(sub, "x@x", access as Entitlement["access"], plan));
      return;
    }
    case "sso": {
      const [sub, email, role = "OWNER"] = args;
      if (!sub || !email) throw new Error("uso: sso <subscriptionId> <email> [role]");
      const now = Math.floor(Date.now() / 1000);
      const token = signHs256Jwt(need("HEECA_PLATFORM_SECRET"), { iss: "heeca-portal", aud: "mind", sub: email, name: "Profissional Simulado", tenantId: null, subscriptionId: sub, role, jti: randomUUID(), iat: now, exp: now + 60 });
      console.log(`${base}/sso/heeca?token=${token}&next=/dashboard`);
      return;
    }
    case "notify": {
      const secret = need("NOTIFY_SECRET");
      const headers = { "X-Heeca-Product": process.env.NOTIFY_PRODUCT ?? "mind" };
      const [kind, a, b, c, d] = args;
      const pmid = () => `sim-${Date.now()}`;
      if (kind === "status") await postSigned("/api/webhooks/notify", secret, { type: "status", providerMessageId: a, status: b ?? "delivered", tenantId: c, ref: d }, headers);
      else if (kind === "button") await postSigned("/api/webhooks/notify", secret, { type: "button_reply", from: a, buttonId: b, providerMessageId: c ?? pmid() }, headers);
      else if (kind === "text") await postSigned("/api/webhooks/notify", secret, { type: "text", from: a, text: b ?? "sim", providerMessageId: c ?? pmid() }, headers);
      else throw new Error("uso: notify status|button|text …");
      return;
    }
    default:
      throw new Error("uso: provision | entitlement | sso | notify (ver cabeçalho do arquivo)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
