import type { Metadata } from "next";
import { db } from "@/lib/db";
import { normalizePrefs } from "@/lib/pro-notify-prefs";
import { requireActor } from "@/lib/session";
import { PrefsForm } from "./prefs-form";

export const metadata: Metadata = { title: "Notificações" };

/** Preferências são do USUÁRIO (não do profissional ativo): cada pessoa decide o que chega na própria caixa. */
export default async function NotificationsPage() {
  const actor = await requireActor();
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { email: true, emailNotifications: true, professional: { select: { id: true } } } });
  return (
    <div className="space-y-4">
      {!user.professional && (
        <p className="max-w-2xl text-sm text-text-muted">Os avisos abaixo são dirigidos ao profissional responsável por cada agenda. Como você não tem perfil profissional, nenhum aviso é gerado para você hoje.</p>
      )}
      <PrefsForm prefs={normalizePrefs(user.emailNotifications)} email={user.email} />
    </div>
  );
}
