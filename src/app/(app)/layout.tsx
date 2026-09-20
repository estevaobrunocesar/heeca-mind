import { signOut } from "@/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ProfessionalSwitcher } from "@/components/layout/professional-switcher";
import { Sidebar } from "@/components/layout/sidebar";
import { db } from "@/lib/db";
import { canViewAnyFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { redirect } from "next/navigation";
import { AccessBanner } from "@/components/layout/access-banner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const [user, org, professionals] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, type: true, accessState: true } }),
    db.professional.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true, slug: true },
    }),
  ]);
  // Gate do portal (entitlement.access): bloqueado não vê nada do app; aviso só informa.
  if (org.accessState === "BLOCKED") redirect("/bloqueado");
  const active = professionals.find((p) => p.id === actor.activeProfessionalId) ?? null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = active ? `${base}/agendar/${active.slug}` : null;
  // Seletor só faz sentido para quem cuida de mais de um profissional.
  const showSwitcher = actor.role !== "PROFESSIONAL" && professionals.length > 1;
  const hideFinance = !canViewAnyFinancials(actor);

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={user.name} publicUrl={publicUrl} orgName={org.type === "CLINIC" ? org.name : null} hideFinance={hideFinance} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b-[3px] border-primary bg-surface px-4 md:px-6">
          <span className="font-semibold md:hidden">Heeca Mind</span>
          <div className="flex flex-1 items-center justify-end gap-4">
            {showSwitcher && (
              <ProfessionalSwitcher options={professionals.map((p) => ({ id: p.id, label: p.displayName }))} activeId={actor.activeProfessionalId} />
            )}
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
          </div>
        </header>
        <MobileNav hideFinance={hideFinance} />
        {org.accessState === "WARNING" && <AccessBanner isOwner={actor.role === "OWNER"} />}
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
