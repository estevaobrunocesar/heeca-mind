import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Financeiro" };

export default function Page() {
  return (
    <>
      <PageHeader title="Financeiro" />
      <EmptyState title="Em construção" description="Controle de pagamentos virá no módulo 9." />
    </>
  );
}
