import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { audit } from "@/lib/audit";
import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS_LABEL } from "@/lib/documents/rules";
import { getDocumentInTenant } from "@/lib/documents/service";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Documento" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd className="break-all">{children}</dd>
    </div>
  );
}

/** Registro interno do documento: texto congelado + prova do aceite. Imprimível (o navegador gera o PDF). */
export default async function DocumentRecordPage({ params }: PageProps<"/pacientes/[id]/documentos/[requestId]">) {
  const { id, requestId } = await params;
  const actor = await requireActor();
  const d = await getDocumentInTenant(actor, requestId);
  if (!d || d.patientId !== id) notFound();
  const tz = d.professional.organization.timezone;
  if (d.status === "ACCEPTED") {
    await audit(actor, { organizationId: actor.organizationId, action: "document.view_record", entityType: "DocumentRequest", entityId: d.id });
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={d.titleSnapshot}
          description={`${DOCUMENT_KIND_LABEL[d.kind]} · versão ${d.templateVersion} · ${DOCUMENT_STATUS_LABEL[d.status]}`}
          actions={
            <div className="flex gap-2">
              <Link href={`/pacientes/${id}`} className="btn-ghost">
                ← Ficha
              </Link>
              {d.status === "ACCEPTED" && <PrintButton />}
            </div>
          }
        />
      </div>
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">{d.titleSnapshot}</h1>
        <p className="text-sm text-text-muted">{d.professional.organization.name}</p>
      </div>

      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem] print:block">
        <article className="card whitespace-pre-wrap text-sm leading-relaxed print:border-0 print:p-0">{d.bodySnapshot}</article>
        <aside className="card print:mt-8 print:border-0 print:p-0">
          <h2 className="mb-2 text-base font-semibold">Registro</h2>
          <dl className="divide-y divide-border">
            <Row label="Paciente">{d.patient.name}</Row>
            <Row label="Profissional">{d.professional.displayName}</Row>
            <Row label="Enviado em">{formatDateTimeBR(d.sentAt, tz)}</Row>
            {d.viewedAt && <Row label="Visualizado em">{formatDateTimeBR(d.viewedAt, tz)}</Row>}
            {d.acceptedAt && <Row label="Aceito em">{formatDateTimeBR(d.acceptedAt, tz)}</Row>}
            {d.acceptName && <Row label="Nome digitado">{d.acceptName}</Row>}
            {d.acceptIp && <Row label="IP">{d.acceptIp}</Row>}
            {d.revokedAt && (
              <Row label="Cancelado em">
                {formatDateTimeBR(d.revokedAt, tz)}
                {d.revokeReason && ` · ${d.revokeReason}`}
              </Row>
            )}
            <Row label="Versão do modelo">{d.templateVersion}</Row>
            <Row label="Hash do texto">{d.bodyHash}</Row>
            {d.acceptanceHash && <Row label="Hash do aceite">{d.acceptanceHash}</Row>}
          </dl>
          {d.status === "ACCEPTED" && <p className="mt-3 text-xs text-text-muted">O hash do aceite amarra texto, nome, instante e IP. Para conferir: sha256(hash do texto|nome normalizado|instante ISO|IP).</p>}
        </aside>
      </div>
    </>
  );
}
