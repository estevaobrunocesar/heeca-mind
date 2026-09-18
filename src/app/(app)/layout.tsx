import { signOut } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [user, professional] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    actor.professionalId
      ? db.professional.findUnique({ where: { id: actor.professionalId }, select: { slug: true } })
      : null,
  ]);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = professional ? `${base}/agendar/${professional.slug}` : null;

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name} publicUrl={publicUrl} />
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-end border-b border-border bg-surface px-6">
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="text-sm text-text-muted hover:text-text">
              Sair
            </button>
          </form>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
