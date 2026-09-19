import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { ServiceForm } from "../service-form";

export const metadata: Metadata = { title: "Editar serviço" };

export default async function EditServicePage({ params }: PageProps<"/servicos/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.activeProfessionalId) notFound();

  // Filtro por professionalId garante o isolamento: id de outro tenant -> 404.
  const service = await db.service.findFirst({
    where: { id, professionalId: actor.activeProfessionalId },
    select: {
      id: true,
      name: true,
      description: true,
      durationMinutes: true,
      priceCents: true,
      modality: true,
      patientInstructions: true,
      isActive: true,
      _count: { select: { appointments: true } },
    },
  });
  if (!service) notFound();

  const { _count, ...values } = service;

  return (
    <>
      <PageHeader
        title="Editar serviço"
        description={
          _count.appointments > 0
            ? `${_count.appointments} agendamento(s) usam este serviço. Alterações de valor não afetam sessões já agendadas.`
            : undefined
        }
      />
      <ServiceForm service={values} defaultDuration={values.durationMinutes} />
    </>
  );
}
