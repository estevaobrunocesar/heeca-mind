import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { AvailabilityEditor } from "./availability-editor";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Horários" };

export default async function SchedulePage() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) {
    return <EmptyState title="Nenhum perfil profissional vinculado" description="Sua conta não possui um perfil de psicólogo." />;
  }
  if (!canEditProfessional(actor, actor.activeProfessionalId)) {
    return <EmptyState title="Sem permissão" description="Recepção não altera perfil, horários ou políticas dos profissionais." />;
  }
  const professionalId = actor.activeProfessionalId;

  const [rules, settings] = await Promise.all([
    db.availabilityRule.findMany({
      where: { professionalId },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      select: { weekday: true, startTime: true, endTime: true },
    }),
    db.scheduleSettings.upsert({
      where: { professionalId },
      create: { professionalId },
      update: {},
    }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <AvailabilityEditor initialRules={rules} />
      <SettingsForm settings={settings} />
    </div>
  );
}
