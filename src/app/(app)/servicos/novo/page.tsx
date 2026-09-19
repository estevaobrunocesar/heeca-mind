import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Novo serviço" };

export default async function NewServicePage() {
  const actor = await requireActor();
  const settings = actor.activeProfessionalId
    ? await db.scheduleSettings.findUnique({
        where: { professionalId: actor.activeProfessionalId },
        select: { defaultDurationMinutes: true },
      })
    : null;

  return (
    <>
      <PageHeader title="Novo serviço" description="Um tipo de atendimento que o paciente poderá escolher." />
      <ServiceForm defaultDuration={settings?.defaultDurationMinutes ?? 50} />
    </>
  );
}
