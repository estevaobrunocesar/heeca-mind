import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return (
    <>
      <PageHeader title="Configurações" />
      <EmptyState title="Em construção" description="Perfil, horários, políticas e WhatsApp virão no módulo 2." />
    </>
  );
}
