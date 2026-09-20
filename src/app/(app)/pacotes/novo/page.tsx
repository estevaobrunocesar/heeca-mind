import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { PackageForm } from "../package-form";

export const metadata: Metadata = { title: "Novo pacote" };

export default async function NewPackagePage() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId || !canEditProfessional(actor, actor.activeProfessionalId)) notFound();
  const services = await db.service.findMany({ where: { professionalId: actor.activeProfessionalId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader title="Novo pacote" description="Vendas guardam uma cópia: mudar o pacote depois não altera o que já foi vendido." />
      <PackageForm services={services} />
    </>
  );
}
