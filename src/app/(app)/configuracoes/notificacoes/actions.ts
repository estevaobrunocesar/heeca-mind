"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { FormState } from "@/lib/form";
import { prefsFromForm } from "@/lib/pro-notify-prefs";
import { requireActor } from "@/lib/session";

export async function saveNotificationPrefsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const prefs = prefsFromForm((name) => formData.get(name) === "on");
  await db.user.update({ where: { id: actor.userId }, data: { emailNotifications: prefs } });
  await audit(actor, { organizationId: actor.organizationId, action: "user.notification_prefs", entityType: "User", entityId: actor.userId, after: { enabled: prefs.enabled, off: Object.entries(prefs.events).filter(([, v]) => !v).map(([k]) => k) } });
  revalidatePath("/configuracoes/notificacoes");
  return { ok: true };
}
