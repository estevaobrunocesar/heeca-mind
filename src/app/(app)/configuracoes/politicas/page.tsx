import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PolicyForm } from "./policy-form";

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
  return <PolicyForm policy={policy} />;
}
