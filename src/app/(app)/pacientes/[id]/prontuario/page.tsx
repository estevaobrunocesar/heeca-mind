import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { canOpenClinicalRecord, KIND_LABEL, listNotes, recentAccess, sessionsWithoutEvolution } from "@/lib/clinical";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";
import { DeleteNoteForm, NewNoteForm } from "./note-forms";

export const metadata: Metadata = { title: "Prontuário" };

const ACTION_LABEL: Record<string, string> = { READ: "leitura", WRITE: "registro", DELETE: "exclusão", EXPORT: "impressão/exportação" };

export default async function ClinicalRecordPage({ params, searchParams }: PageProps<"/pacientes/[id]/prontuario">) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await requireActor();

  const patient = await db.patient.findFirst({
    where: { id, organizationId: actor.organizationId },
    select: { id: true, name: true, anonymizedAt: true, organization: { select: { timezone: true } } },
  });
  if (!patient) notFound();
  const tz = patient.organization.timezone;

  // A regra: só o profissional responsável (papel + relação de atendimento). Nada é decifrado antes disto.
  if (!(await canOpenClinicalRecord(actor, id))) {
    return (
      <>
        <PageHeader title={`Prontuário · ${patient.name}`} />
        <EmptyState
          title="Acesso restrito ao profissional responsável"
          description="Anotações clínicas só são visíveis para o psicólogo que atende (ou atendeu) este paciente. Outros profissionais, recepção e administração da clínica não têm acesso, por sigilo profissional (CFP, art. 9)."
        />
      </>
    );
  }
  if (patient.anonymizedAt) {
    return (
      <>
        <PageHeader title="Prontuário" />
        <EmptyState title="Cadastro anonimizado" description="As notas clínicas foram apagadas ao fim do prazo de retenção." />
      </>
    );
  }

  const [notes, sessions, access] = await Promise.all([listNotes(actor, id), sessionsWithoutEvolution(actor, id), recentAccess(actor, id)]);
  const defaultAppointmentId = typeof sp.sessao === "string" && sessions.some((s) => s.id === sp.sessao) ? sp.sessao : undefined;

  return (
    <>
      <PageHeader
        title={`Prontuário · ${patient.name}`}
        description="Registro clínico cifrado. Cada leitura fica registrada."
        actions={
          <div className="flex gap-2">
            <Link href={`/pacientes/${id}`} className="btn-ghost">
              ← Ficha
            </Link>
            {notes.length > 0 && (
              <a href={`/pacientes/${id}/prontuario/imprimir`} target="_blank" rel="noreferrer" className="btn-ghost">
                Imprimir / PDF
              </a>
            )}
          </div>
        }
      />

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <NewNoteForm
            patientId={id}
            sessions={sessions.map((s) => ({ id: s.id, label: `${formatDateTimeBR(s.startsAt, tz)} · ${s.serviceNameSnapshot}` }))}
            defaultAppointmentId={defaultAppointmentId}
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Histórico · {notes.length} registro(s)</h2>
            {notes.length === 0 ? (
              <p className="card text-sm text-text-muted">Nenhuma anotação ainda.</p>
            ) : (
              notes.map((n) => (
                <article key={n.id} className="card">
                  <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">{KIND_LABEL[n.kind]}</span>
                      {n.appointment && (
                        <Link href={`/agenda/${n.appointment.id}`} className="ml-2 text-xs text-text-muted hover:text-primary">
                          sessão de {formatDateTimeBR(n.appointment.startsAt, tz)} · {n.appointment.serviceNameSnapshot}
                        </Link>
                      )}
                    </div>
                    <span className="text-xs text-text-muted">
                      {formatDateTimeBR(n.createdAt, tz)} · {n.authorName}
                    </span>
                  </header>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.content}</p>
                  <footer className="mt-3">
                    <DeleteNoteForm patientId={id} noteId={n.id} />
                  </footer>
                </article>
              ))
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="text-base font-semibold">Acessos recentes</h2>
            <p className="mt-1 text-xs text-text-muted">Quem abriu, registrou, excluiu ou imprimiu este prontuário.</p>
            {access.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Nenhum acesso registrado.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border text-xs">
                {access.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {a.userName} · {ACTION_LABEL[a.action] ?? a.action}
                    </span>
                    <span className="shrink-0 text-text-muted">{formatDateTimeBR(a.createdAt, tz)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card text-xs text-text-muted">
            <p className="mb-1 font-medium text-text">Sobre este registro</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Conteúdo cifrado (AES-256-GCM); um dump do banco não o revela.</li>
              <li>Visível só para você. Dono da clínica e recepção não veem.</li>
              <li>Guarda mínima de 5 anos (CFP 001/2009); apagado na anonimização do cadastro.</li>
              <li>Nunca entra em mensagens de WhatsApp, e-mails ou na auditoria administrativa.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
