import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { db } from "@/lib/db";
import { portalAccountUrl } from "@/lib/heeca/service";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Acesso suspenso" };

/**
 * Destino de quem tem assinatura bloqueada no portal (entitlement.access = blocked).
 * Fora do grupo (app) de propósito: o layout do app redireciona para cá.
 */
export default async function BlockedPage() {
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, accessState: true } });
  if (org.accessState !== "BLOCKED") redirect("/dashboard");
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="card w-full max-w-md text-center">
        <h1 className="text-2xl font-normal text-primary">Acesso suspenso</h1>
        <p className="mt-3 text-sm text-text-muted">
          A assinatura de <strong className="text-text">{org.name}</strong> no Heeca Mind está suspensa. Os dados continuam guardados; nada foi apagado.
        </p>
        {actor.role === "OWNER" ? (
          <a href={portalAccountUrl()} className="btn-primary mt-6 w-full">
            Regularizar na conta Heeca
          </a>
        ) : (
          <p className="mt-6 text-sm">Avise o responsável pela conta para regularizar a assinatura.</p>
        )}
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
          className="mt-4"
        >
          <button type="submit" className="text-sm text-text-muted hover:text-text">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
