import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { activeDelegationsFor, clinicalScopes, DOCUMENT_KIND_LABEL, KIND_LABEL, listDocuments, listNotes, recentAccess, sessionsWithoutEvolution, treatedSessions } from "@/lib/clinical";
import { DELEGATION_KIND_LABEL, pickWriteScope } from "@/lib/clinical-delegation";
import { db } from "@/lib/db";
import { formatBytes } from "@/lib/document";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";
import { DeleteDocumentForm, UploadDocumentForm } from "./document-forms";
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

  // A regra: só o profissional responsável (papel + relação de atendimento) ou um delegado. Nada é decifrado antes disto.
  const scopes = await clinicalScopes(actor, id);
  if (scopes.length === 0) {
    return (
      <>
        <PageHeader title={`Prontuário · ${patient.name}`} />
        <EmptyState
          title="Acesso restrito ao profissional responsável"
          description="Anotações clínicas só são visíveis para o psicólogo que atende (ou atendeu) este paciente — ou para quem ele delegou expressamente (supervisão/substituição). Recepção e administração da clínica não têm acesso, por sigilo profissional (CFP, art. 9)."
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

  const [notes, sessions, access, documents, allSessions, shared] = await Promise.all([
    listNotes(actor, id),
    sessionsWithoutEvolution(actor, id),
    recentAccess(actor, id),
    listDocuments(actor, id),
    treatedSessions(actor, id),
    activeDelegationsFor(actor, id),
  ]);
  const defaultAppointmentId = typeof sp.sessao === "string" && sessions.some((s) => s.id === sp.sessao) ? sp.sessao : undefined;
  const delegated = scopes.filter((s) => s.delegationId !== null);
  const canWrite = pickWriteScope(scopes) !== null;
  const writeTarget = pickWriteScope(scopes);

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
            {(notes.length > 0 || documents.length > 0) && (
              <a href={`/pacientes/${id}/prontuario/imprimir`} target="_blank" rel="noreferrer" className="btn-ghost">
                Imprimir / PDF
              </a>
            )}
          </div>
        }
      />

      {delegated.length > 0 && (
        <div className="mb-6 max-w-6xl rounded-lg border border-primary/40 bg-primary-soft px-4 py-3 text-sm">
          {delegated.map((d) => (
            <p key={d.delegationId}>
              Você está acessando o prontuário de <strong>{d.grantorName}</strong> por delegação — {DELEGATION_KIND_LABEL[d.kind!].toLowerCase()}, até{" "}
              {formatDateTimeBR(d.expiresAt!, tz)}. Cada acesso é registrado e visível ao titular.
              {!d.canWrite && " Somente leitura."}
            </p>
          ))}
        </div>
      )}

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {canWrite ? (
            <NewNoteForm
              patientId={id}
              sessions={sessions.map((s) => ({ id: s.id, label: `${formatDateTimeBR(s.startsAt, tz)} · ${s.serviceNameSnapshot}` }))}
              defaultAppointmentId={defaultAppointmentId}
              targetName={writeTarget?.delegationId ? writeTarget.grantorName : undefined}
            />
          ) : (
            <p className="card text-sm text-text-muted">Supervisão: leitura apenas. Registros continuam a cargo do profissional responsável.</p>
          )}

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
                      {n.viaDelegation && " (em substituição)"}
                    </span>
                  </header>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.content}</p>
                  {n.canDelete && (
                    <footer className="mt-3">
                      <DeleteNoteForm patientId={id} noteId={n.id} />
                    </footer>
                  )}
                </article>
              ))
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Documentos · {documents.length}</h2>
            </div>
            {canWrite && <UploadDocumentForm patientId={id} sessions={allSessions.map((s) => ({ id: s.id, label: `${formatDateTimeBR(s.startsAt, tz)} · ${s.serviceNameSnapshot}` }))} />}
            {documents.length === 0 ? (
              <p className="text-xs text-text-muted">Laudos, encaminhamentos, declarações, termos assinados e exames ficam aqui, cifrados.</p>
            ) : (
              <ul className="space-y-2">
                {documents.map((d) => (
                  <li key={d.id} className="card space-y-1 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">{DOCUMENT_KIND_LABEL[d.kind]}</span>
                        <p className="mt-1 truncate text-sm font-medium" title={d.title}>
                          {d.title}
                        </p>
                        {d.description && <p className="text-xs text-text-muted">{d.description}</p>}
                        <p className="text-xs text-text-muted">
                          {formatDateTimeBR(d.createdAt, tz)} · {formatBytes(d.sizeBytes)} · {d.authorName}
                          {d.viaDelegation && " (em substituição)"}
                          {d.appointment && <> · sessão de {formatDateTimeBR(d.appointment.startsAt, tz)}</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <a href={`/pacientes/${id}/prontuario/documentos/${d.id}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                        Abrir
                      </a>
                      <a href={`/pacientes/${id}/prontuario/documentos/${d.id}?download=1`} className="text-text-muted hover:text-primary">
                        Baixar
                      </a>
                      {d.canDelete && <DeleteDocumentForm patientId={id} documentId={d.id} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {shared.length > 0 && (
            <section className="card">
              <h2 className="text-base font-semibold">Compartilhado com</h2>
              <ul className="mt-2 space-y-1 text-xs">
                {shared.map((d) => (
                  <li key={d.id}>
                    <strong>{d.delegate.displayName}</strong> · {DELEGATION_KIND_LABEL[d.kind].toLowerCase()} · até {formatDateTimeBR(d.expiresAt, tz)}
                    {!d.patient && " · todos os pacientes"}
                  </li>
                ))}
              </ul>
              <Link href="/configuracoes/delegacoes" className="mt-2 inline-block text-xs text-primary hover:underline">
                Gerenciar delegações
              </Link>
            </section>
          )}

          <section className="card">
            <h2 className="text-base font-semibold">Acessos recentes</h2>
            <p className="mt-1 text-xs text-text-muted">Quem abriu, registrou, excluiu ou imprimiu notas e documentos deste prontuário.</p>
            {access.length === 0 ? (
              <p className="mt-3 text-sm text-text-muted">Nenhum acesso registrado.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border text-xs">
                {access.map((a, i) => (
                  <li key={i} className="flex justify-between gap-2 py-1.5">
                    <span>
                      {a.userName} · {ACTION_LABEL[a.action] ?? a.action}
                      {a.viaDelegation && <span className="text-primary"> · {a.viaDelegation === "SUPERVISION" ? "supervisão" : "substituição"}</span>}
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
              <li>Visível só para você e para quem você delegar expressamente. Dono da clínica e recepção não veem.</li>
              <li>Guarda mínima de 5 anos (CFP 001/2009); apagado na anonimização do cadastro.</li>
              <li>Nunca entra em mensagens de WhatsApp, e-mails ou na auditoria administrativa.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
