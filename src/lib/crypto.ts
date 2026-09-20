import "server-only";
import * as core from "./crypto-core";

/**
 * Cifragem simétrica de campos e arquivos sensíveis (notas clínicas,
 * documentos, respostas de formulários, segredo MFA).
 *
 * Chaveiro vem do ambiente:
 *   ENCRYPTION_KEY           chave atual (cifra o que é novo)
 *   ENCRYPTION_KEY_PREVIOUS  chaves antigas, separadas por vírgula, só para decifrar
 *
 * Rotação: troque ENCRYPTION_KEY pela nova, coloque a antiga em
 * ENCRYPTION_KEY_PREVIOUS, faça deploy, rode `npm run rotate-key` até zerar
 * e então remova a antiga. Detalhes em docs/DEPLOY.md.
 *
 * Formato e regras: src/lib/crypto-core.ts (puro, testado).
 */

let cached: { sig: string; ring: core.Keyring } | null = null;

export function keyring(): core.Keyring {
  const primary = process.env.ENCRYPTION_KEY;
  if (!primary) throw new Error("ENCRYPTION_KEY não definida");
  const previous = process.env.ENCRYPTION_KEY_PREVIOUS ?? "";
  const sig = `${primary}|${previous}`;
  if (!cached || cached.sig !== sig) cached = { sig, ring: core.makeKeyring(primary, previous) };
  return cached.ring;
}

export const currentKeyId = () => core.keyIdOf(keyring().primary);

export const encrypt = (plaintext: string) => core.encrypt(keyring(), plaintext);
export const decrypt = (payload: string) => core.decrypt(keyring(), payload);
export const encryptBytes = (plaintext: Buffer) => core.encryptBytes(keyring(), plaintext);
export const decryptBytes = (data: Buffer) => core.decryptBytes(keyring(), data);

/** Para o job de rotação. */
export const isCurrent = (payload: string | Buffer) => core.isCurrent(keyring(), payload);
export const rotateText = (payload: string) => core.rotateText(keyring(), payload);
export const rotateBytes = (data: Buffer) => core.rotateBytes(keyring(), data);
