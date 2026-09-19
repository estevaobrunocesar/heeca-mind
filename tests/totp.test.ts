import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, hotp, otpauthUri, totp, verifyTotp } from "../src/lib/mfa/totp";

// RFC 6238, Apêndice B: segredo ASCII "12345678901234567890", SHA-1, 8 dígitos.
const RFC_SECRET = Buffer.from("12345678901234567890", "ascii");
const RFC_SECRET_B32 = base32Encode(RFC_SECRET);
const VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

describe("TOTP", () => {
  it("reproduz os vetores do RFC 6238 (8 dígitos)", () => {
    for (const [t, expected] of VECTORS) {
      assert.equal(totp(RFC_SECRET_B32, { time: t * 1000, digits: 8 }), expected, `t=${t}`);
    }
  });
  it("6 dígitos = últimos 6 do valor de 8", () => {
    assert.equal(totp(RFC_SECRET_B32, { time: 59 * 1000 }), "287082");
  });
  it("RFC 4226: HOTP counter 0..2", () => {
    assert.equal(hotp(RFC_SECRET, 0), "755224");
    assert.equal(hotp(RFC_SECRET, 1), "287082");
    assert.equal(hotp(RFC_SECRET, 2), "359152");
  });
  it("verifica com janela ±1 passo e rejeita fora dela ou malformado", () => {
    const t = 1111111111 * 1000;
    assert.equal(verifyTotp(RFC_SECRET_B32, "050471", { time: t }).ok, true);
    assert.equal(verifyTotp(RFC_SECRET_B32, "050471", { time: t + 30_000 }).ok, true); // passo anterior
    assert.equal(verifyTotp(RFC_SECRET_B32, "050471", { time: t + 61_000 }).ok, false); // 2 passos
    assert.equal(verifyTotp(RFC_SECRET_B32, "05047", { time: t }).ok, false);
    assert.equal(verifyTotp(RFC_SECRET_B32, "000000", { time: t }).ok, false);
    assert.equal(verifyTotp(RFC_SECRET_B32, "050 471", { time: t }).ok, true); // tolera espaço
  });
});

describe("base32", () => {
  it("round-trip e compatível com o padrão (RFC 4648)", () => {
    assert.equal(base32Encode(Buffer.from("foobar")), "MZXW6YTBOI");
    assert.deepEqual(base32Decode("MZXW6YTBOI"), Buffer.from("foobar"));
    assert.deepEqual(base32Decode("mzxw 6ytb oi"), Buffer.from("foobar")); // minúsculo e espaços
  });
});

describe("otpauth e recuperação", () => {
  it("monta a URI que os apps esperam", () => {
    const uri = otpauthUri({ issuer: "Hecca Psico", account: "ana@exemplo.com", secret: "ABC234" });
    assert.ok(uri.startsWith("otpauth://totp/Hecca%20Psico%3Aana%40exemplo.com?"));
    assert.ok(uri.includes("secret=ABC234") && uri.includes("issuer=Hecca+Psico") && uri.includes("digits=6"));
  });
  it("gera 8 códigos únicos no formato xxxxx-xxxxx; hash ignora formatação", () => {
    const codes = generateRecoveryCodes();
    assert.equal(new Set(codes).size, 8);
    for (const c of codes) assert.match(c, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
    assert.equal(hashRecoveryCode("ABCDE-FGHJK"), hashRecoveryCode("abcdefghjk"));
  });
});
