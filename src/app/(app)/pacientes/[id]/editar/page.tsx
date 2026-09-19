import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PatientForm } from "../../patient-form";

export const metadata: Metadata = { title: "Editar paciente" };

export default async function EditPatientPage({ params }: PageProps<"/pacientes/[id]/editar">) {
  const { id } = await params;
  const actor = await requireActor();
  const patient = await db.patient.findFirst({
    where: { id, organizationId: actor.organizationId, deletedAt: null },
    select: {
      id: true,
      name: true,
      whatsapp: true,
      email: true,
      usualModality: true,
      followUpStatus: true,
      preferredPaymentMethod: true,
      needsReceipt: true,
      bestContactTime: true,
      adminNotes: true,
    },
  });
  if (!patient) notFound();

  return (
    <>
      <PageHeader title={`Editar · ${patient.name}`} />
      <PatientForm patient={patient} />
    </>
  );
}
