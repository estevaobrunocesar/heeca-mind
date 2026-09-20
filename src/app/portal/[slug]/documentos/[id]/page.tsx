import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { acceptedDocumentForPortal, getPortalActor, professionalBySlug } from "@/lib/portal/service";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Documento" };

export default async function PortalDocumentPage({ params }: PageProps<"/portal/[slug]/documentos/[id]">) {
  const { slug, id } = await params;
  const pro = await professionalBySlug(slug);
  if (!pro) notFound();
  const actor = await getPortalActor(pro.organizationId);
  if (!actor) redirect(`/portal/${slug}?expired=1`);
  const d = await acceptedDocumentForPortal(actor, id);
  if (!d) notFound();
  const tz = d.professional.organization.timezone;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4 print:hidden">
        <div>
          <Link href={`/portal/${slug}`} className="text-sm text-text-muted hover:text-text">
            ← Início
          </Link>
          <h1 className="mt-1 text-2xl font-normal text-primary">{d.titleSnapshot}</h1>
        </div>
        <PrintButton />
      </div>
      <h1 className="hidden text-xl font-semibold print:block">{d.titleSnapshot}</h1>
      <article className="card whitespace-pre-wrap text-sm leading-relaxed print:border-0 print:p-0">{d.bodySnapshot}</article>
      <section className="rounded-lg border border-border bg-surface-muted/50 p-4 text-xs text-text-muted print:border-0 print:p-0">
        <p className="font-medium text-text">Aceito eletronicamente</p>
        <p>
          por <strong className="text-text">{d.acceptName}</strong> em {d.acceptedAt ? formatDateTimeBR(d.acceptedAt, tz) : "—"} · versão {d.templateVersion} · {d.professional.displayName}
        </p>
        <p className="mt-1 break-all">Hash do documento: {d.bodyHash}</p>
      </section>
    </div>
  );
}
