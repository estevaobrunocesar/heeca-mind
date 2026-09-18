import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Agenda" };

export default function Page() {
  return (
    <>
      <PageHeader title="Agenda" />
      <EmptyState title="Em construção" description="Visualização diária, semanal e mensal virá no módulo 4." />
    </>
  );
}
