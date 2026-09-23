import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { professionalSeats } from "@/lib/heeca/service";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { formatDateBR, formatDateTimeBR } from "@/lib/time";
import Link from "next/link";
import { InviteForm, TeamList } from "./team-panel";

export const metadata: Metadata = { title: "Equipe" };

export default async function TeamPage() {
  const actor = await requireActor();
  if (!canManageMembers(actor)) {
    return <EmptyState title="Só o responsável gerencia a equipe" description="Peça ao responsável pela clínica para convidar ou remover pessoas." />;
  }

  const [org, memberships, invites] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, slug: true, timezone: true } }),
    db.membership.findMany({
      where: { organizationId: actor.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, userId: true, user: { select: { name: true, email: true, lastLoginAt: true, professional: { select: { id: true } } } } },
    }),
    db.invitation.findMany({ where: { organizationId: actor.organizationId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  const seats = await professionalSeats(actor.organizationId);

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-sm text-text-muted">
        Nome, página pública e dados da clínica ficam na aba{" "}
        <Link href="/configuracoes/clinica" className="text-primary hover:underline">
          Clínica
        </Link>
        .
      </p>
      {seats.max !== null && (
        <p className="text-sm text-text-muted">
          Profissionais: <strong className="text-text">{seats.active}</strong> de {seats.max} do seu plano.
          {seats.active >= seats.max && " Para incluir mais alguém, remova um profissional da equipe ou mude de plano na sua conta Heeca."}
        </p>
      )}
      <InviteForm />
      <TeamList
        members={memberships.map((m) => ({
          membershipId: m.id,
          userId: m.userId,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
          hasProfile: !!m.user.professional,
          isMe: m.userId === actor.userId,
          lastLoginAt: m.user.lastLoginAt ? formatDateTimeBR(m.user.lastLoginAt, org.timezone) : null,
        }))}
        invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: formatDateBR(i.expiresAt, org.timezone) }))}
      />
    </div>
  );
}
