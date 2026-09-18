import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { todayCivil } from "@/lib/availability";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { NewAppointmentForm } from "./new-appointment-form";

export const metadata: Metadata = { title: "Nova sessão" };

export default async function NewAppointmentPage({ searchParams }: PageProps<"/agenda/novo">) {
  const sp = await searchParams;
  const actor = await requireActor();
  if (!actor.professionalId) {
    return <EmptyState title="Nenhum perfil profissional vinculado" description="Apenas profissionais podem criar sessões por aqui." />;
  }

  const [org, services, patients] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
    db.service.findMany({
      where: { professionalId: actor.professionalId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, modality: true, durationMinutes: true },
    }),
    db.patient.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, whatsapp: true },
      take: 500,
    }),
  ]);

  if (services.length === 0) {
    return (
      <EmptyState
        title="Cadastre um serviço primeiro"
        description="Toda sessão precisa de um tipo de atendimento com duração e valor."
      />
    );
  }

  const defaultDate = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayCivil(new Date(), org.timezone);
  const defaultTime = typeof sp.time === "string" && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : undefined;

  return (
    <>
      <PageHeader title="Nova sessão" description="Agendamento manual — para quem combinou direto com você." />
      <NewAppointmentForm services={services} patients={patients} defaultDate={defaultDate} defaultTime={defaultTime} />
    </>
  );
}
