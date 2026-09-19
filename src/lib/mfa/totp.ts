import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * TOTP (RFC 6238) sobre HOTP (RFC 4226), SHA-1, 6 dígitos, passo de 30 s —
 * o perfil que todo app autenticador entende. Puro, sem dependências;
 * testado contra os vetores do RFC em tests/totp.test.ts.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Segredo novo: 20 bytes (160 bits), como recomenda o RFC 4226. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1] & 0x0f;
  const code = ((h[offset] & 0x7f) << 24) | (h[offset + 1] << 16) | (h[offset + 2] << 8) | h[offset + 3];
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, opts: { time?: number; step?: number; digits?: number } = {}): string {
  const time = opts.time ?? Date.now();
  const step = opts.step ?? 30;
  return hotp(base32Decode(secretBase32), Math.floor(time / 1000 / step), opts.digits ?? 6);
}

/**
 * Verifica aceitando ±1 passo (relógios desalinhados em até 30 s).
 * Devolve o contador aceito para que o chamador bloqueie reuso do mesmo
 * código dentro da janela (replay).
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  opts: { time?: number; step?: number; digits?: number; window?: number } = {},
): { ok: boolean; counter: number | null } {
  const digits = opts.digits ?? 6;
  const clean = code.replace(/\D/g, "");
  if (clean.length !== digits) return { ok: false, counter: null };
  const time = opts.time ?? Date.now();
  const step = opts.step ?? 30;
  const window = opts.window ?? 1;
  const base = Math.floor(time / 1000 / step);
  const secret = base32Decode(secretBase32);
  for (let i = -window; i <= window; i++) {
    const counter = base + i;
    const expected = hotp(secret, counter, digits);
    if (expected.length === clean.length && timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) {
      return { ok: true, counter };
    }
  }
  return { ok: false, counter: null };
}

/** URI para o QR code (otpauth://). `issuer` aparece no app do usuário. */
export function otpauthUri(params: { issuer: string; account: string; secret: string }): string {
  const label = encodeURIComponent(`${params.issuer}:${params.account}`);
  const q = new URLSearchParams({ secret: params.secret, issuer: params.issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ──────────────────────────────────────────────────────────────
// Códigos de recuperação
// ──────────────────────────────────────────────────────────────

const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"; // sem 0/o/1/l/i

/** 8 códigos de 10 caracteres, no formato xxxxx-xxxxx. */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
}
