import { signOut } from "@/auth";
import { AccessBanner } from "@/components/layout/access-banner";
import { ProfessionalSwitcher } from "@/components/layout/professional-switcher";
import { AppShell } from "@/components/dashboard/shell";
import { db } from "@/lib/db";
import { canViewAnyFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { redirect } from "next/navigation";

const PAPEIS = { OWNER: "responsável", PROFESSIONAL: "psicólogo(a)", RECEPTIONIST: "secretaria", FINANCE: "financeiro" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  const now = new Date();
  const [user, org, professionals, pendentes] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, type: true, accessState: true, planCode: true, timezone: true } }),
    db.professional.findMany({
      where: { organizationId: actor.organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, displayName: true, slug: true, photoUrl: true, specialties: true },
    }),
    // Sino: sessões futuras ainda sem confirmação do paciente ou com reagendamento pedido
    db.appointment.count({ where: { ...(actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId }), startsAt: { gte: now }, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "RESCHEDULE_REQUESTED"] } } }),
  ]);
  // Gate do portal (entitlement.access): bloqueado não vê nada do app; aviso só informa.
  if (org.accessState === "BLOCKED") redirect("/bloqueado");
  const active = professionals.find((p) => p.id === actor.activeProfessionalId) ?? null;
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const publicUrl = active ? `${base}/agendar/${active.slug}` : null;
  // Seletor só faz sentido para quem cuida de mais de um profissional.
  const showSwitcher = actor.role !== "PROFESSIONAL" && professionals.length > 1;
  const hoje = now.toLocaleDateString("pt-BR", { timeZone: org.timezone, weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
  const especialidade = actor.role === "PROFESSIONAL" ? active?.specialties?.[0] : undefined;

  return (
    <AppShell
      org={{ name: org.name, heecaPlan: org.planCode }}
      user={{ name: user.name, photoUrl: actor.role === "PROFESSIONAL" ? active?.photoUrl : null }}
      papel={[especialidade, PAPEIS[actor.role as keyof typeof PAPEIS] ?? actor.role].filter(Boolean).join(" · ")}
      publicUrl={publicUrl}
      pendentes={pendentes}
      hoje={hoje.charAt(0).toUpperCase() + hoje.slice(1)}
      hideFinance={!canViewAnyFinancials(actor)}
      extra={showSwitcher ? <ProfessionalSwitcher options={professionals.map((p) => ({ id: p.id, label: p.displayName }))} activeId={actor.activeProfessionalId} /> : null}
      banner={org.accessState === "WARNING" ? <AccessBanner isOwner={actor.role === "OWNER"} /> : null}
      sair={
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="link-mut">Sair</button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
