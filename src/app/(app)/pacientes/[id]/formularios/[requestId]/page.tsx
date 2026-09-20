import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ClinicalAccessDenied } from "@/lib/clinical";
import { db } from "@/lib/db";
import { FormError, readAnswers } from "@/lib/forms";
import { formatAnswer } from "@/lib/forms-schema";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Respostas do formulário" };

/**
 * Respostas de um pedido. CLINICAL passa por readAnswers → regras do
 * prontuário + log READ; ADMINISTRATIVE por canManageSchedule.
 */
export default async function FormAnswersPage({ params }: PageProps<"/pacientes/[id]/formularios/[requestId]">) {
  const { id, requestId } = await params;
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });

  let data: Awaited<ReturnType<typeof readAnswers>>;
  try {
    data = await readAnswers(actor, requestId);
  } catch (e) {
    if (e instanceof ClinicalAccessDenied || e instanceof FormError) {
      return (
        <>
          <PageHeader title="Respostas do formulário" />
          <EmptyState title="Acesso restrito" description="Respostas clínicas só são visíveis para o profissional responsável (ou delegado). Termos, para quem gerencia a agenda." />
        </>
      );
    }
    throw e;
  }
  if (!data || data.patientId !== id) notFound();

  return (
    <>
      <PageHeader
        title={data.title}
        description={`${data.patientName} · respondido em ${formatDateTimeBR(data.submittedAt, org.timezone)} · ${data.dataClass === "CLINICAL" ? "clínico (cifrado; leitura registrada)" : "administrativo"}`}
        actions={
          <Link href={data.dataClass === "CLINICAL" ? `/pacientes/${id}/prontuario` : `/pacientes/${id}`} className="btn-ghost">
            ← {data.dataClass === "CLINICAL" ? "Prontuário" : "Ficha"}
          </Link>
        }
      />
      <div className="max-w-3xl space-y-3">
        {data.description && <p className="text-sm text-text-muted">{data.description}</p>}
        <dl className="card divide-y divide-border">
          {data.fields
            .filter((f) => f.type !== "info")
            .map((f) => (
              <div key={f.id} className="py-3">
                <dt className="text-sm text-text-muted">{f.label}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">{formatAnswer(f, data.answers[f.id])}</dd>
              </div>
            ))}
        </dl>
        {data.fields.some((f) => f.type === "info") && (
          <details className="text-xs text-text-muted">
            <summary className="cursor-pointer">Textos exibidos ao paciente</summary>
            {data.fields
              .filter((f) => f.type === "info")
              .map((f) => (
                <p key={f.id} className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted p-3">
                  {f.label}
                </p>
              ))}
          </details>
        )}
      </div>
    </>
  );
}
