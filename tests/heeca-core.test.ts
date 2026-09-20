import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accessStateOf, membershipRoleFor, planLimit, safeNextPath, signBody, signHs256Jwt, verifySignedBody, verifySsoJwt } from "../src/lib/heeca/core";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";

describe("HMAC portal/Notify", () => {
  const body = JSON.stringify({ subscriptionId: "sub_1" });
  it("aceita assinatura válida dentro da janela", () => {
    const { ts, sig } = signBody(SECRET, body, 1_000_000);
    assert.deepEqual(verifySignedBody(SECRET, body, { ts, sig }, 1_000_000 + 60_000), { ok: true });
  });
  it("rejeita fora da janela de 5 min, corpo alterado, segredo errado e hex inválido", () => {
    const { ts, sig } = signBody(SECRET, body, 1_000_000);
    assert.equal(verifySignedBody(SECRET, body, { ts, sig }, 1_000_000 + 6 * 60_000).ok, false);
    assert.equal(verifySignedBody(SECRET, body + " ", { ts, sig }, 1_000_000).ok, false);
    assert.equal(verifySignedBody("outro-segredo-tambem-bem-comprido", body, { ts, sig }, 1_000_000).ok, false);
    assert.equal(verifySignedBody(SECRET, body, { ts, sig: "zz".repeat(32) }, 1_000_000).ok, false);
    assert.equal(verifySignedBody(SECRET, body, { ts: null, sig: null }, 1_000_000).ok, false);
    assert.equal(verifySignedBody("", body, { ts, sig }, 1_000_000).ok, false);
  });
});

describe("JWT de SSO (HS256)", () => {
  const now = 1_700_000_000;
  const claims = { iss: "heeca-portal", aud: "mind", sub: "Ana@Exemplo.com", name: "Ana", tenantId: null, subscriptionId: "sub_1", role: "OWNER", jti: "jti-12345678", iat: now, exp: now + 60 };
  it("valida e normaliza as claims", () => {
    const r = verifySsoJwt(SECRET, signHs256Jwt(SECRET, claims), { nowMs: now * 1000 });
    assert.ok(r.ok);
    assert.equal(r.claims.email, "ana@exemplo.com");
    assert.equal(r.claims.subscriptionId, "sub_1");
    assert.equal(r.claims.role, "OWNER");
    assert.equal(r.claims.jti, "jti-12345678");
  });
  it("rejeita expirado (com tolerância de 30 s), audiência errada, emissor errado e assinatura errada", () => {
    const tok = signHs256Jwt(SECRET, claims);
    assert.ok(verifySsoJwt(SECRET, tok, { nowMs: (now + 85) * 1000 }).ok, "dentro da tolerância");
    assert.equal(verifySsoJwt(SECRET, tok, { nowMs: (now + 100) * 1000 }).ok, false);
    assert.equal(verifySsoJwt(SECRET, signHs256Jwt(SECRET, { ...claims, aud: "dental" }), { nowMs: now * 1000 }).ok, false);
    assert.equal(verifySsoJwt(SECRET, signHs256Jwt(SECRET, { ...claims, iss: "x" }), { nowMs: now * 1000 }).ok, false);
    assert.equal(verifySsoJwt("outro-segredo-tambem-bem-comprido", tok, { nowMs: now * 1000 }).ok, false);
  });
  it("rejeita alg none, token malformado e sem jti", () => {
    const [, body, sig] = signHs256Jwt(SECRET, claims).split(".");
    const noneHead = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    assert.equal(verifySsoJwt(SECRET, `${noneHead}.${body}.${sig}`, { nowMs: now * 1000 }).ok, false);
    assert.equal(verifySsoJwt(SECRET, "abc.def", { nowMs: now * 1000 }).ok, false);
    assert.equal(verifySsoJwt(SECRET, signHs256Jwt(SECRET, { ...claims, jti: undefined }), { nowMs: now * 1000 }).ok, false);
  });
});

describe("mapeamentos", () => {
  it("accessStateOf: access manda; status terminal sem access coerente bloqueia", () => {
    assert.equal(accessStateOf({ access: "ok", status: "ACTIVE" }), "OK");
    assert.equal(accessStateOf({ access: "warning", status: "PAST_DUE" }), "WARNING");
    assert.equal(accessStateOf({ access: "blocked", status: "ACTIVE" }), "BLOCKED");
    assert.equal(accessStateOf({ access: "ok", status: "CANCELED" }), "BLOCKED");
  });
  it("membershipRoleFor: OWNER/ADMIN → OWNER; demais → RECEPTIONIST", () => {
    assert.equal(membershipRoleFor("OWNER"), "OWNER");
    assert.equal(membershipRoleFor("ADMIN"), "OWNER");
    assert.equal(membershipRoleFor("BILLING"), "RECEPTIONIST");
    assert.equal(membershipRoleFor("MEMBER"), "RECEPTIONIST");
  });
  it("safeNextPath só aceita caminho interno", () => {
    assert.equal(safeNextPath("/agenda?d=1"), "/agenda?d=1");
    assert.equal(safeNextPath("//evil.com"), "/dashboard");
    assert.equal(safeNextPath("https://evil.com"), "/dashboard");
    assert.equal(safeNextPath("/sso/heeca?token=x"), "/dashboard");
    assert.equal(safeNextPath(null), "/dashboard");
  });
  it("planLimit ignora lixo", () => {
    assert.equal(planLimit({ maxProfessionals: 3 }, "maxProfessionals"), 3);
    assert.equal(planLimit({ maxProfessionals: "3" }, "maxProfessionals"), null);
    assert.equal(planLimit(null, "x"), null);
  });
});
