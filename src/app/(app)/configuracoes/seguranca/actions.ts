"use server";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { audit } from "@/lib/audit";
import { beginEnrollment, confirmEnrollment, disableMfa, regenerateRecoveryCodes, requireCurrentCode } from "@/lib/mfa/service";
import { requireActor } from "@/lib/session";
import { auth } from "@/auth";
import { revokeAllSessions, revokeSession } from "@/lib/sessions";

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
    // As outras sessões não passaram pelo segundo fator: derruba.
    const current = (await auth())?.user.sid;
    await revokeAllSessions(actor.userId, "mfa_enabled", current);
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

// ──────────────────────────────────────────────────────────────
// Sessões
// ──────────────────────────────────────────────────────────────

export async function revokeSessionAction(sid: string): Promise<{ ok: boolean }> {
  const actor = await requireActor();
  const ok = await revokeSession(sid, actor.userId, "user");
  if (ok) await audit(actor, { organizationId: actor.organizationId, action: "auth.session_revoke", entityType: "User", entityId: actor.userId, after: { sid } });
  revalidatePath("/configuracoes/seguranca");
  return { ok };
}

export async function revokeOtherSessionsAction(): Promise<{ revoked: number }> {
  const actor = await requireActor();
  const current = (await auth())?.user.sid;
  const revoked = await revokeAllSessions(actor.userId, "user", current);
  await audit(actor, { organizationId: actor.organizationId, action: "auth.session_revoke_all", entityType: "User", entityId: actor.userId, after: { revoked } });
  revalidatePath("/configuracoes/seguranca");
  return { revoked };
}
