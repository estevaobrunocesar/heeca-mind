import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Serviços" };

export default function Page() {
  return (
    <>
      <PageHeader title="Serviços" />
      <EmptyState title="Em construção" description="Cadastro de tipos de sessão virá no módulo 3." />
    </>
  );
}
