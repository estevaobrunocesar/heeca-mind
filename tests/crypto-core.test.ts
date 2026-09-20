import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { decrypt, decryptBytes, decryptBytesInfo, decryptInfo, encrypt, encryptBytes, isCurrent, keyIdOf, makeKeyring, rotateBytes, rotateText } from "../src/lib/crypto-core";

const K1 = randomBytes(32).toString("base64");
const K2 = randomBytes(32).toString("base64");
const K3 = randomBytes(32).toString("base64");

/** Formato antigo (sem envelope), como o crypto.ts gravava antes da rotação. */
function legacySeal(keyB64: string, plaintext: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
  const ct = Buffer.concat([c.update(plaintext), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

describe("keyring", () => {
  it("valida tamanho e remove a primária das anteriores", () => {
    assert.throws(() => makeKeyring("curta"), /32 bytes/);
    const ring = makeKeyring(K1, `${K2}, ${K1}`);
    assert.equal(ring.previous.length, 1);
    assert.equal(keyIdOf(ring.previous[0]), keyIdOf(Buffer.from(K2, "base64")));
  });
  it("keyId tem 8 hex e é estável", () => {
    const k = Buffer.from(K1, "base64");
    assert.match(keyIdOf(k), /^[0-9a-f]{8}$/);
    assert.equal(keyIdOf(k), keyIdOf(Buffer.from(K1, "base64")));
  });
});

describe("texto", () => {
  const ring = makeKeyring(K1);
  it("ida e volta com envelope k1:<kid>:", () => {
    const c = encrypt(ring, "sigilo ção");
    assert.match(c, /^k1:[0-9a-f]{8}:[A-Za-z0-9+/=]+$/);
    assert.equal(decrypt(ring, c), "sigilo ção");
    assert.equal(isCurrent(ring, c), true);
  });
  it("legado (base64 puro) decifra com a chave certa e é marcado como não-atual", () => {
    const legacy = legacySeal(K1, Buffer.from("nota antiga")).toString("base64");
    const r = decryptInfo(ring, legacy);
    assert.equal(r.plaintext, "nota antiga");
    assert.equal(r.envelope, false);
    assert.equal(isCurrent(ring, legacy), false);
  });
  it("legado cifrado com chave anterior só abre se ela estiver no chaveiro", () => {
    const legacy = legacySeal(K2, Buffer.from("de antes")).toString("base64");
    assert.throws(() => decrypt(makeKeyring(K1), legacy), /nenhuma chave/);
    assert.equal(decrypt(makeKeyring(K1, K2), legacy), "de antes");
  });
  it("envelope de chave desconhecida dá erro claro", () => {
    const c = encrypt(makeKeyring(K3), "x");
    assert.throws(() => decrypt(makeKeyring(K1, K2), c), /não está no chaveiro/);
  });
  it("alteração no ciframento é detectada (GCM)", () => {
    const c = encrypt(ring, "íntegro");
    const [p, kid, b64] = c.split(":");
    const buf = Buffer.from(b64, "base64");
    buf[buf.length - 1] ^= 0x01;
    assert.throws(() => decrypt(ring, `${p}:${kid}:${buf.toString("base64")}`));
  });
});

describe("bytes", () => {
  const ring = makeKeyring(K1);
  it("ida e volta com magic + keyId", () => {
    const pdf = Buffer.from("%PDF-1.4 conteudo");
    const c = encryptBytes(ring, pdf);
    assert.equal(c.subarray(0, 6).toString("latin1"), "\0HPENC");
    assert.deepEqual(decryptBytes(ring, c), pdf);
    assert.equal(isCurrent(ring, c), true);
  });
  it("blob legado abre por tentativa e é marcado como não-atual", () => {
    const legacy = legacySeal(K2, Buffer.from("blob antigo"));
    const r = decryptBytesInfo(makeKeyring(K1, K2), legacy);
    assert.equal(r.plaintext.toString(), "blob antigo");
    assert.equal(r.envelope, false);
    assert.equal(isCurrent(ring, legacy), false);
  });
});

describe("rotação", () => {
  it("recifra o que não está na chave atual e não toca no que já está", () => {
    const old = makeKeyring(K1);
    const rotating = makeKeyring(K2, K1);
    const legacyText = legacySeal(K1, Buffer.from("a")).toString("base64");
    const envText = encrypt(old, "b");
    const current = encrypt(rotating, "c");

    const r1 = rotateText(rotating, legacyText);
    const r2 = rotateText(rotating, envText);
    const r3 = rotateText(rotating, current);
    assert.equal(r1.changed, true);
    assert.equal(r2.changed, true);
    assert.equal(r3.changed, false);
    assert.equal(r3.payload, current);
    // depois da rotação, a chave antiga pode sair do chaveiro
    const after = makeKeyring(K2);
    assert.equal(decrypt(after, r1.payload), "a");
    assert.equal(decrypt(after, r2.payload), "b");
    assert.throws(() => decrypt(after, envText), /não está no chaveiro/);
  });
  it("bytes idem", () => {
    const rotating = makeKeyring(K2, K1);
    const legacy = legacySeal(K1, Buffer.from("blob"));
    const r = rotateBytes(rotating, legacy);
    assert.equal(r.changed, true);
    assert.equal(decryptBytes(makeKeyring(K2), r.data).toString(), "blob");
    assert.equal(rotateBytes(rotating, r.data).changed, false);
  });
});
