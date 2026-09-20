import "server-only";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { rateLimit, RULES } from "@/lib/rate-limit";
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp,
} from "./totp";

export const MFA_ISSUER = "Heeca Mind";

/**
 * Passo 1 da ativação: gera e guarda (cifrado) um segredo provisório. Só
 * vira MFA de verdade quando o usuário prova que o app gera o código certo.
 */
export async function beginEnrollment(userId: string): Promise<{ secret: string; uri: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, mfaEnabled: true } });
  if (user.mfaEnabled) throw new Error("MFA já está ativo");
  const secret = generateSecret();
  await db.user.update({ where: { id: userId }, data: { mfaSecretEnc: encrypt(secret) } });
  return { secret, uri: otpauthUri({ issuer: MFA_ISSUER, account: user.email, secret }) };
}

/** Passo 2: confirma com um código válido; devolve os códigos de recuperação (única vez em claro). */
export async function confirmEnrollment(userId: string, code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaSecretEnc: true, mfaEnabled: true } });
  if (user.mfaEnabled) return { ok: false, error: "MFA já está ativo." };
  if (!user.mfaSecretEnc) return { ok: false, error: "Inicie a ativação novamente." };

  const limited = await rateLimit(RULES.mfaVerify, userId);
  if (!limited.ok) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };

  const { ok } = verifyTotp(decrypt(user.mfaSecretEnc), code);
  if (!ok) return { ok: false, error: "Código inválido. Confira o horário do celular e tente de novo." };

  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaEnabledAt: new Date(), mfaRecoveryHashes: recoveryCodes.map(hashRecoveryCode) },
  });
  return { ok: true, recoveryCodes };
}

/**
 * Verifica o segundo fator no login. Aceita código do app ou de recuperação
 * (consumido). Ao passar, registra a prova para o `sid` — o JWT só é
 * liberado com essa linha existindo (ver src/auth.ts).
 */
export async function verifySecondFactor(
  userId: string,
  sid: string,
  input: string,
): Promise<{ ok: true; usedRecovery: boolean; remainingRecovery: number } | { ok: false; error: string }> {
  const limited = await rateLimit(RULES.mfaVerify, userId);
  if (!limited.ok) return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos." };

  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecretEnc: true, mfaRecoveryHashes: true },
  });
  if (!user.mfaEnabled || !user.mfaSecretEnc) return { ok: false, error: "MFA não está ativo." };

  const digits = input.replace(/\D/g, "");
  let usedRecovery = false;
  let remaining = user.mfaRecoveryHashes.length;

  if (digits.length === 6 && verifyTotp(decrypt(user.mfaSecretEnc), digits).ok) {
    // ok
  } else {
    const h = hashRecoveryCode(input);
    if (!user.mfaRecoveryHashes.includes(h)) return { ok: false, error: "Código inválido." };
    const rest = user.mfaRecoveryHashes.filter((x) => x !== h);
    await db.user.update({ where: { id: userId }, data: { mfaRecoveryHashes: rest } });
    usedRecovery = true;
    remaining = rest.length;
  }

  await db.mfaVerification.upsert({ where: { sid }, create: { sid, userId }, update: { createdAt: new Date() } });
  return { ok: true, usedRecovery, remainingRecovery: remaining };
}

/** Exige um código válido do app para operações sensíveis (desativar, regenerar). */
export async function requireCurrentCode(userId: string, code: string): Promise<string | null> {
  const limited = await rateLimit(RULES.mfaVerify, userId);
  if (!limited.ok) return "Muitas tentativas. Aguarde alguns minutos.";
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { mfaEnabled: true, mfaSecretEnc: true } });
  if (!user.mfaEnabled || !user.mfaSecretEnc) return "MFA não está ativo.";
  return verifyTotp(decrypt(user.mfaSecretEnc), code).ok ? null : "Código inválido.";
}

export async function regenerateRecoveryCodes(userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();
  await db.user.update({ where: { id: userId }, data: { mfaRecoveryHashes: codes.map(hashRecoveryCode) } });
  return codes;
}

export async function disableMfa(userId: string): Promise<void> {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaEnabledAt: null, mfaSecretEnc: null, mfaRecoveryHashes: [] } }),
    db.mfaVerification.deleteMany({ where: { userId } }),
  ]);
}

/** Limpeza: provas de MFA não consumidas em 15 min (login abandonado). */
export async function purgeStaleMfaVerifications() {
  const r = await db.mfaVerification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 15 * 60_000) } } });
  return r.count;
}
