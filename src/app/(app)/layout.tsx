import { signOut } from "@/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
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
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:justify-end md:px-6">
          <span className="font-semibold md:hidden">Hecca Psico</span>
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
        <MobileNav />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
