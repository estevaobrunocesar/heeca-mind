import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifragem simétrica de campos sensíveis (anotações clínicas, segredo MFA).
 *
 * Formato do texto cifrado (base64): [iv:12 bytes][authTag:16 bytes][ciphertext]
 * AES-256-GCM garante confidencialidade + integridade: qualquer alteração no
 * banco faz a decifragem falhar em vez de devolver lixo silenciosamente.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY não definida");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY deve ter 32 bytes em base64 (openssl rand -base64 32)");
  }
  return key;
}

/** Cifra bytes (arquivos do prontuário). Saída: iv + tag + ciphertext. */
export function encryptBytes(plaintext: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

export function decryptBytes(payload: Buffer): Buffer {
  if (payload.length < IV_LENGTH + TAG_LENGTH) throw new Error("Payload cifrado inválido");
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encrypt(plaintext: string): string {
  return encryptBytes(Buffer.from(plaintext, "utf8")).toString("base64");
}

export function decrypt(payload: string): string {
  return decryptBytes(Buffer.from(payload, "base64")).toString("utf8");
}
