import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { canManageMembers } from "@/lib/permissions";
import { PolicyForm } from "./policy-form";
import { RetentionForm } from "./retention-form";

export const metadata: Metadata = { title: "Políticas" };

export default async function PoliciesPage() {
  const actor = await requireActor();
  if (!actor.professionalId) {
    return <EmptyState title="Nenhum perfil profissional vinculado" description="Sua conta não possui um perfil de psicólogo." />;
  }
  const policy = await db.professionalPolicy.upsert({
    where: { professionalId: actor.professionalId },
    create: { professionalId: actor.professionalId },
    update: {},
  });
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { retentionYears: true } });
  return (
    <div className="space-y-6">
      <PolicyForm policy={policy} />
      <RetentionForm retentionYears={org.retentionYears} canEdit={canManageMembers(actor)} />
    </div>
  );
}
