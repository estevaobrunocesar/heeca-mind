"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { audit } from "@/lib/audit";
import { beginEnrollment, confirmEnrollment, disableMfa, regenerateRecoveryCodes, requireCurrentCode } from "@/lib/mfa/service";
import { requireActor } from "@/lib/session";

export type EnrollmentStart = { secret: string; qrDataUrl: string };

/** Gera segredo + QR. O segredo em texto fica visível para digitação manual. */
export async function startMfaAction(): Promise<EnrollmentStart> {
  const actor = await requireActor();
  const { secret, uri } = await beginEnrollment(actor.userId);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return { secret, qrDataUrl };
}

export async function confirmMfaAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const actor = await requireActor();
  const r = await confirmEnrollment(actor.userId, code);
  if (r.ok) {
    await audit(actor, { organizationId: actor.organizationId, action: "auth.mfa_enable", entityType: "User", entityId: actor.userId });
    revalidatePath("/configuracoes/seguranca");
  }
  return r;
}

export async function regenerateRecoveryAction(code: string): Promise<{ ok: true; recoveryCodes: string[] } | { ok: false; error: string }> {
  const actor = await requireActor();
  const err = await requireCurrentCode(actor.userId, code);
  if (err) return { ok: false, error: err };
  const recoveryCodes = await regenerateRecoveryCodes(actor.userId);
  await audit(actor, { organizationId: actor.organizationId, action: "auth.mfa_recovery_regen", entityType: "User", entityId: actor.userId });
  revalidatePath("/configuracoes/seguranca");
  return { ok: true, recoveryCodes };
}

export async function disableMfaAction(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await requireActor();
  const err = await requireCurrentCode(actor.userId, code);
  if (err) return { ok: false, error: err };
  await disableMfa(actor.userId);
  await audit(actor, { organizationId: actor.organizationId, action: "auth.mfa_disable", entityType: "User", entityId: actor.userId });
  revalidatePath("/configuracoes/seguranca");
  return { ok: true };
}
