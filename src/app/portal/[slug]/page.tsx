import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS_LABEL } from "@/lib/documents/rules";
import { formatBRL } from "@/lib/money";
import { PURCHASE_STATUS_LABEL } from "@/lib/packages/rules";
import { getPortalActor, patientCanChange, portalHome, professionalBySlug } from "@/lib/portal/service";
import { STATUS_LABEL } from "@/lib/appointment-status";
import { formatDateBR, formatDateTimeBR } from "@/lib/time";
import { AccessForm } from "./access-form";
import { OpenDocumentButton } from "./open-document-button";

export const metadata: Metadata = { title: "Portal do paciente" };

export default async function PortalHomePage({ params, searchParams }: PageProps<"/portal/[slug]">) {
  const { slug } = await params;
  const sp = await searchParams;
  const pro = await professionalBySlug(slug);
  if (!pro) notFound();
  const actor = await getPortalActor(pro.organizationId);

  if (!actor) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-normal text-primary">Portal do paciente</h1>
        <p className="mt-1 text-sm text-text-muted">Veja suas próximas sessões, reagende ou cancele dentro da política, acompanhe pagamentos, pacotes e documentos.</p>
        {sp.expired === "1" && <p className="mt-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">Sua sessão no portal terminou. Peça um novo link.</p>}
        {sp.invalid === "1" && <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">Este link de acesso não é mais válido (vale 15 minutos e uma única vez). Peça outro.</p>}
        <div className="mt-6">
          <AccessForm slug={slug} />
        </div>
        <p className="mt-6 text-center text-sm text-text-muted">
          Ainda não é paciente?{" "}
          <Link href={`/agendar/${slug}`} className="text-primary hover:underline">
            Agendar uma sessão
          </Link>
        </p>
      </div>
    );
  }

  const tz = pro.organization.timezone;
  const home = await portalHome(actor);
  const first = actor.patientName.split(" ")[0];
  const pendingDocs = home.documents.filter((d) => d.status === "PENDING" || d.status === "VIEWED");
  const acceptedDocs = home.documents.filter((d) => d.status === "ACCEPTED");

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <h1 className="text-2xl font-normal text-primary">Olá, {first}</h1>
        {sp.cancelled === "1" && <p className="mt-2 text-sm text-success">Sessão cancelada. O profissional foi avisado.</p>}
        {sp.rescheduled === "1" && <p className="mt-2 text-sm text-success">Sessão reagendada. Você receberá a confirmação por WhatsApp.</p>}
      </div>

      {pendingDocs.length > 0 && (
        <section className="card border-warning/40">
          <h2 className="text-base font-semibold">Documentos aguardando sua leitura</h2>
          <ul className="mt-2 divide-y divide-border">
            {pendingDocs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {d.titleSnapshot} <span className="text-xs text-text-muted">· {DOCUMENT_KIND_LABEL[d.kind]}</span>
                </span>
                <OpenDocumentButton slug={slug} requestId={d.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="text-base font-semibold">Próximas sessões</h2>
        {home.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            Nenhuma sessão marcada.{" "}
            <Link href={`/agendar/${slug}`} className="text-primary hover:underline">
              Agendar
            </Link>
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {home.upcoming.map((a) => {
              const link = a.onlineLink ?? a.professional.onlineFixedLink;
              const canChange = patientCanChange(a, Math.min(a.professional.scheduleSettings?.minCancelHours ?? 24, a.professional.scheduleSettings?.minRescheduleHours ?? 24)).ok;
              return (
                <li key={a.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {formatDateTimeBR(a.startsAt, tz)} · {a.serviceNameSnapshot}
                    </p>
                    <span className="text-xs text-text-muted">{STATUS_LABEL[a.status]}</span>
                  </div>
                  <p className="text-xs text-text-muted">
                    {a.professional.displayName} · {a.modality === "ONLINE" ? "Online" : "Presencial"}
                    {a.paymentStatus === "PACKAGE" && " · coberta pelo pacote"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {a.modality === "ONLINE" && link && (
                      <a href={link} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        Acessar sessão online ↗
                      </a>
                    )}
                    {a.status === "AWAITING_CONFIRMATION" && a.confirmationToken && (
                      <Link href={`/confirmar/${a.confirmationToken}`} className="text-primary hover:underline">
                        Confirmar presença
                      </Link>
                    )}
                    {canChange && (
                      <Link href={`/portal/${slug}/sessoes/${a.id}`} className="text-text-muted hover:text-text hover:underline">
                        Reagendar ou cancelar
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(home.pendingPayments.length > 0 || home.purchases.length > 0) && (
        <section className="card">
          <h2 className="text-base font-semibold">Pagamentos e pacotes</h2>
          {home.pendingPayments.length > 0 && (
            <>
              <p className="mt-2 text-xs uppercase tracking-wide text-text-muted">Em aberto</p>
              <ul className="divide-y divide-border">
                {home.pendingPayments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <span>
                      {formatDateBR(a.startsAt, tz)} · {a.serviceNameSnapshot}
                    </span>
                    <span className="font-medium tabular-nums">{formatBRL(a.priceCents)}</span>
                  </li>
                ))}
              </ul>
              {home.pendingPayments[0].professional.policy?.paymentInfo && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-xs">{home.pendingPayments[0].professional.policy.paymentInfo}</p>}
            </>
          )}
          {home.purchases.length > 0 && (
            <>
              <p className="mt-3 text-xs uppercase tracking-wide text-text-muted">Pacotes</p>
              <ul className="divide-y divide-border">
                {home.purchases.map((p) => (
                  <li key={p.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-text-muted">{PURCHASE_STATUS_LABEL[p.status]}</span>
                    </div>
                    <p className="text-xs text-text-muted">
                      {p.total} contratadas · {p.total - p.balance} usadas · <strong className="text-text">{p.balance} disponíveis</strong> · {p.status === "EXPIRED" ? "venceu" : "vence"} em {formatDateBR(p.expiresAt, tz)}
                      {p.paymentStatus === "PENDING" && ` · pagamento pendente (${formatBRL(p.priceCents)})`}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {acceptedDocs.length > 0 && (
        <section className="card">
          <h2 className="text-base font-semibold">Documentos aceitos</h2>
          <ul className="mt-2 divide-y divide-border">
            {acceptedDocs.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {d.titleSnapshot} <span className="text-xs text-text-muted">· v{d.templateVersion} · {DOCUMENT_STATUS_LABEL[d.status]} em {d.acceptedAt ? formatDateBR(d.acceptedAt, tz) : ""}</span>
                </span>
                <Link href={`/portal/${slug}/documentos/${d.id}`} className="text-xs text-primary hover:underline">
                  Ver
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
