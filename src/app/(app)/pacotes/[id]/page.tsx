import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { PackageForm } from "../package-form";

export const metadata: Metadata = { title: "Editar pacote" };

export default async function EditPackagePage({ params }: PageProps<"/pacotes/[id]">) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.activeProfessionalId || !canEditProfessional(actor, actor.activeProfessionalId)) notFound();
  // Filtro por professionalId garante o isolamento: id de outro tenant -> 404.
  const [pkg, services] = await Promise.all([
    db.package.findFirst({ where: { id, professionalId: actor.activeProfessionalId }, include: { _count: { select: { purchases: true } } } }),
    db.service.findMany({ where: { professionalId: actor.activeProfessionalId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!pkg) notFound();
  const { _count, ...values } = pkg;
  return (
    <>
      <PageHeader title="Editar pacote" description={_count.purchases > 0 ? `${_count.purchases} venda(s) usam este pacote. Alterações não afetam o que já foi vendido.` : undefined} />
      <PackageForm pkg={values} services={services} />
    </>
  );
}
