"use server";

import { redirect } from "next/navigation";
import { auth, unstable_update } from "@/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { verifySecondFactor } from "@/lib/mfa/service";

export async function verifyMfaAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id) redirect("/login");
  if (!u.mfaPending) redirect("/dashboard");

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { fieldErrors: { code: ["Informe o código"] } };

  const r = await verifySecondFactor(u.id, u.sid, code);
  if (!r.ok) {
    await db.accessLog.create({ data: { userId: u.id, email: u.email ?? "", success: false, ip: null, userAgent: "mfa" } });
    return { error: r.error };
  }

  await audit({ userId: u.id, organizationId: u.organizationId, role: u.role, professionalId: u.professionalId }, {
    organizationId: u.organizationId,
    action: r.usedRecovery ? "auth.mfa_recovery" : "auth.mfa",
    entityType: "User",
    entityId: u.id,
    after: r.usedRecovery ? { remainingRecovery: r.remainingRecovery } : undefined,
  });

  // Prova gravada no banco; o callback jwt (src/auth.ts) confere e libera.
  await unstable_update({ user: { mfaPending: false } });
  redirect(r.usedRecovery && r.remainingRecovery <= 2 ? "/configuracoes/seguranca?low=1" : "/dashboard");
}
