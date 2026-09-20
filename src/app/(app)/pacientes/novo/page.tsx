import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente" };

export default async function NewPatientPage() {
  const actor = await requireActor();
  const tagSuggestions = (await db.tag.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: "asc" }, select: { name: true } })).map((t) => t.name);
  return (
    <>
      <PageHeader title="Novo paciente" description="Cadastro administrativo. Ao agendar pela página pública, o paciente é criado automaticamente." />
      <PatientForm tagSuggestions={tagSuggestions} />
    </>
  );
}
