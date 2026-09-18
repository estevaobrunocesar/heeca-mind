import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Pacientes" };

export default function Page() {
  return (
    <>
      <PageHeader title="Pacientes" />
      <EmptyState title="Em construção" description="Cadastro automático e histórico administrativo virão no módulo 5." />
    </>
  );
}
