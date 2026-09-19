import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canOpenClinicalRecord, DOCUMENT_KIND_LABEL, KIND_LABEL, listDocuments, listNotes, logExport } from "@/lib/clinical";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/document";
import { requireActor } from "@/lib/session";
import { formatDateBR, formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Prontuário — impressão" };

/**
 * Versão para impressão/PDF (Ctrl+P). Uso: entrega ao paciente (art. 18 LGPD,
 * CFP 001/2009), transferência para outro profissional, arquivo físico.
 * Registra EXPORT em cada nota.
 */
export default async function PrintClinicalRecordPage({ params }: PageProps<"/pacientes/[id]/prontuario/imprimir">) {
  const { id } = await params;
  const actor = await requireActor();
  if (!actor.professionalId || !(await canOpenClinicalRecord(actor, id))) notFound();

  const [patient, pro] = await Promise.all([
    db.patient.findFirst({
      where: { id, organizationId: actor.organizationId, anonymizedAt: null },
      select: { name: true, whatsapp: true, firstAppointmentAt: true, organization: { select: { name: true, timezone: true } } },
    }),
    db.professional.findUniqueOrThrow({ where: { id: actor.professionalId }, select: { displayName: true, fullName: true, crp: true } }),
  ]);
  if (!patient) notFound();
  const tz = patient.organization.timezone;
  const notes = (await listNotes(actor, id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const documents = (await listDocuments(actor, id)).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  await logExport(actor, id, notes.map((n) => n.id));

  return (
    <main className="mx-auto max-w-3xl bg-white p-8 text-[13px] leading-relaxed text-black print:p-0">
      <style>{`@media print { aside, nav, header.app { display: none } @page { margin: 2cm } }`}</style>
      <header className="mb-6 border-b border-black pb-3">
        <h1 className="text-lg font-semibold">Prontuário psicológico</h1>
        <p>
          <strong>Paciente:</strong> {patient.name} · {patient.whatsapp}
          {patient.firstAppointmentAt && <> · desde {formatDateBR(patient.firstAppointmentAt, tz)}</>}
        </p>
        <p>
          <strong>Profissional:</strong> {pro.fullName} ({pro.displayName}) · CRP {pro.crp} · {patient.organization.name}
        </p>
        <p className="text-xs">
          Emitido em {formatDateTimeBR(new Date(), tz)} · {notes.length} registro(s) · {documents.length} anexo(s) · documento sigiloso (CFP, Código de Ética, art. 9)
        </p>
      </header>

      {notes.map((n, i) => (
        <article key={n.id} className="mb-5 break-inside-avoid">
          <h2 className="text-sm font-semibold">
            {i + 1}. {KIND_LABEL[n.kind]} — {formatDateTimeBR(n.createdAt, tz)}
            {n.appointment && <span className="font-normal"> · sessão de {formatDateTimeBR(n.appointment.startsAt, tz)} ({n.appointment.serviceNameSnapshot})</span>}
          </h2>
          <p className="text-xs text-neutral-600">
            Registrado por {n.authorName}
            {n.viaDelegation && " (em substituição)"}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{n.content}</p>
        </article>
      ))}

      {documents.length > 0 && (
        <section className="mt-8 break-inside-avoid">
          <h2 className="mb-2 text-sm font-semibold">Anexos ({documents.length}) — arquivos entregues em separado</h2>
          <ol className="list-decimal space-y-1 pl-5">
            {documents.map((d) => (
              <li key={d.id}>
                <strong>{DOCUMENT_KIND_LABEL[d.kind]}</strong> — {d.title} · {d.fileName} ({formatBytes(d.sizeBytes)}) · {formatDateTimeBR(d.createdAt, tz)}
                {d.appointment && <> · sessão de {formatDateTimeBR(d.appointment.startsAt, tz)}</>}
                {d.description && <span className="block text-neutral-600">{d.description}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="mt-10 border-t border-black pt-3 text-xs">
        <p>_____________________________________________</p>
        <p>
          {pro.fullName} · CRP {pro.crp}
        </p>
      </footer>
    </main>
  );
}
