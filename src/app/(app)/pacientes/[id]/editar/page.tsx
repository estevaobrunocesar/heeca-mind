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
      phone: true,
      birthDate: true,
      addressLine: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      emergencyContactName: true,
      emergencyContactPhone: true,
      commsPrefs: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  if (!patient) notFound();
  const tagSuggestions = (await db.tag.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" }, select: { name: true } })).map((t) => t.name);
  const values = {
    ...patient,
    birthDate: patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : null, // @db.Date: data civil, sem fuso
    tags: patient.tags.map((t) => t.tag.name),
  };

  return (
    <>
      <PageHeader title={`Editar · ${patient.name}`} />
      <PatientForm patient={values} tagSuggestions={tagSuggestions} />
    </>
  );
}
