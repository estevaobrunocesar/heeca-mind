import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getPortalActor, professionalBySlug } from "@/lib/portal/service";
import { SelfForm } from "./self-form";

export const metadata: Metadata = { title: "Meus dados" };

/** Dados administrativos que o paciente mantém sozinho. WhatsApp é identidade — só a recepção altera. */
export default async function PortalSelfPage({ params }: PageProps<"/portal/[slug]/dados">) {
  const { slug } = await params;
  const pro = await professionalBySlug(slug);
  if (!pro) notFound();
  const actor = await getPortalActor(pro.organizationId);
  if (!actor) redirect(`/portal/${slug}?expired=1`);
  const p = await db.patient.findUniqueOrThrow({
    where: { id: actor.patientId },
    select: { name: true, whatsapp: true, email: true, phone: true, addressLine: true, addressCity: true, addressState: true, addressZip: true, emergencyContactName: true, emergencyContactPhone: true, commsPrefs: true },
  });
  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <Link href={`/portal/${slug}`} className="text-sm text-text-muted hover:text-text">
          ← Início
        </Link>
        <h1 className="mt-1 text-2xl font-normal text-primary">Meus dados</h1>
        <p className="text-sm text-text-muted">
          {p.name} · WhatsApp {p.whatsapp} <span className="text-xs">(para mudar nome ou WhatsApp, fale com o profissional)</span>
        </p>
      </div>
      <SelfForm slug={slug} patient={{ ...p, commsPrefs: p.commsPrefs }} />
    </div>
  );
}
