import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Núcleo puro da cifra (sem env, sem banco) — testado em tests/crypto-core.test.ts.
 *
 * Formato do texto cifrado, por chave: [iv:12][tag:16][ciphertext] (AES-256-GCM).
 *
 * Envelope com identificação da chave (desde a rotação de chaves):
 *   texto : "k1:<keyId>:<base64 do payload>"
 *   bytes : [magic "\0HPENC" (6)][versão 0x01][len keyId][keyId ascii][payload]
 * Dados anteriores ("legado") não têm envelope: são o payload puro em base64
 * (texto) ou os bytes puros (blobs). Para eles, tentamos cada chave do
 * chaveiro — o tag do GCM rejeita a chave errada.
 *
 * keyId = 8 primeiros hex de sha256(chave): identifica sem expor.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const TEXT_PREFIX = "k1:";
const BYTES_MAGIC = Buffer.from("\0HPENC", "latin1");
const BYTES_VERSION = 0x01;

export type Keyring = {
  /** Chave atual: cifra tudo que é novo. */
  primary: Buffer;
  /** Chaves anteriores, só para decifrar durante a rotação. */
  previous: Buffer[];
};

export function keyIdOf(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

export function parseKey(raw: string, name = "ENCRYPTION_KEY"): Buffer {
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) throw new Error(`${name} deve ter 32 bytes em base64 (openssl rand -base64 32)`);
  return key;
}

export function makeKeyring(primaryRaw: string, previousRaw?: string | null): Keyring {
  const primary = parseKey(primaryRaw);
  const previous = (previousRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s, i) => parseKey(s, `ENCRYPTION_KEY_PREVIOUS[${i}]`))
    .filter((k) => !k.equals(primary));
  return { primary, previous };
}

// ── primitivas por chave ────────────────────────────────────────

function sealWith(key: Buffer, plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

function openWith(key: Buffer, payload: Buffer): Buffer {
  if (payload.length < IV_LENGTH + TAG_LENGTH) throw new Error("Payload cifrado inválido");
  const decipher = createDecipheriv(ALGO, key, payload.subarray(0, IV_LENGTH));
  decipher.setAuthTag(payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(payload.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]);
}

function keyById(ring: Keyring, keyId: string): Buffer | null {
  return [ring.primary, ...ring.previous].find((k) => keyIdOf(k) === keyId) ?? null;
}

/** Legado (sem envelope): tenta cada chave; a errada falha no tag. */
function openLegacy(ring: Keyring, payload: Buffer): { plaintext: Buffer; keyId: string } {
  let lastErr: unknown;
  for (const key of [ring.primary, ...ring.previous]) {
    try {
      return { plaintext: openWith(key, payload), keyId: keyIdOf(key) };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Não foi possível decifrar: nenhuma chave do chaveiro serve (dado corrompido ou chave perdida)", { cause: lastErr });
}

// ── bytes ───────────────────────────────────────────────────────

export function encryptBytes(ring: Keyring, plaintext: Buffer): Buffer {
  const kid = Buffer.from(keyIdOf(ring.primary), "ascii");
  return Buffer.concat([BYTES_MAGIC, Buffer.from([BYTES_VERSION, kid.length]), kid, sealWith(ring.primary, plaintext)]);
}

export type Opened = { plaintext: Buffer; keyId: string; envelope: boolean };

export function decryptBytesInfo(ring: Keyring, data: Buffer): Opened {
  if (data.length > BYTES_MAGIC.length + 2 && data.subarray(0, BYTES_MAGIC.length).equals(BYTES_MAGIC)) {
    const version = data[BYTES_MAGIC.length];
    if (version !== BYTES_VERSION) throw new Error(`Versão de envelope desconhecida: ${version}`);
    const len = data[BYTES_MAGIC.length + 1];
    const start = BYTES_MAGIC.length + 2;
    const keyId = data.subarray(start, start + len).toString("ascii");
    const key = keyById(ring, keyId);
    if (!key) throw new Error(`Chave ${keyId} não está no chaveiro (ENCRYPTION_KEY / ENCRYPTION_KEY_PREVIOUS)`);
    return { plaintext: openWith(key, data.subarray(start + len)), keyId, envelope: true };
  }
  return { ...openLegacy(ring, data), envelope: false };
}

export function decryptBytes(ring: Keyring, data: Buffer): Buffer {
  return decryptBytesInfo(ring, data).plaintext;
}

// ── texto ───────────────────────────────────────────────────────

export function encrypt(ring: Keyring, plaintext: string): string {
  return `${TEXT_PREFIX}${keyIdOf(ring.primary)}:${sealWith(ring.primary, Buffer.from(plaintext, "utf8")).toString("base64")}`;
}

export function decryptInfo(ring: Keyring, payload: string): { plaintext: string; keyId: string; envelope: boolean } {
  if (payload.startsWith(TEXT_PREFIX)) {
    const [, keyId, b64] = payload.split(":");
    const key = keyId && b64 ? keyById(ring, keyId) : null;
    if (!keyId || !b64) throw new Error("Envelope de texto inválido");
    if (!key) throw new Error(`Chave ${keyId} não está no chaveiro (ENCRYPTION_KEY / ENCRYPTION_KEY_PREVIOUS)`);
    return { plaintext: openWith(key, Buffer.from(b64, "base64")).toString("utf8"), keyId, envelope: true };
  }
  const r = openLegacy(ring, Buffer.from(payload, "base64"));
  return { plaintext: r.plaintext.toString("utf8"), keyId: r.keyId, envelope: false };
}

export function decrypt(ring: Keyring, payload: string): string {
  return decryptInfo(ring, payload).plaintext;
}

// ── rotação ─────────────────────────────────────────────────────

/** Já está na chave atual, com envelope? (Sem decifrar; legado sempre precisa.) */
export function isCurrent(ring: Keyring, payload: string | Buffer): boolean {
  const kid = keyIdOf(ring.primary);
  if (typeof payload === "string") return payload.startsWith(`${TEXT_PREFIX}${kid}:`);
  if (payload.length <= BYTES_MAGIC.length + 2 || !payload.subarray(0, BYTES_MAGIC.length).equals(BYTES_MAGIC)) return false;
  const len = payload[BYTES_MAGIC.length + 1];
  return payload.subarray(BYTES_MAGIC.length + 2, BYTES_MAGIC.length + 2 + len).toString("ascii") === kid;
}

/** Decifra com a chave que for e recifra com a atual. Idempotente. */
export function rotateText(ring: Keyring, payload: string): { payload: string; changed: boolean } {
  if (isCurrent(ring, payload)) return { payload, changed: false };
  return { payload: encrypt(ring, decrypt(ring, payload)), changed: true };
}

export function rotateBytes(ring: Keyring, data: Buffer): { data: Buffer; changed: boolean } {
  if (isCurrent(ring, data)) return { data, changed: false };
  return { data: encryptBytes(ring, decryptBytes(ring, data)), changed: true };
}
