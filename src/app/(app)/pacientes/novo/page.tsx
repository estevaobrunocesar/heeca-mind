import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PatientForm } from "../patient-form";

export const metadata: Metadata = { title: "Novo paciente" };

export default function NewPatientPage() {
  return (
    <>
      <PageHeader title="Novo paciente" description="Cadastro administrativo. Ao agendar pela página pública, o paciente é criado automaticamente." />
      <PatientForm />
    </>
  );
}
