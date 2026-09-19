import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR, slotLabelInTz, toLocalFields } from "@/lib/time";
import { AdminNoteForm, OnlineLinkForm, StatusActions } from "./appointment-actions";
import { PaymentSection } from "./payment-section";
import { canViewFinancials } from "@/lib/permissions";
import { canWriteFor } from "@/lib/clinical";

export const metadata: Metadata = { title: "Sessão" };

const TONE_BADGE = {
  neutral: "bg-surface-muted text-text",
  warning: "bg-warning/15 text-warning",
  success: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-muted text-text-muted",
} as const;

const PAYMENT_LABEL = { PENDING: "Pendente", PAID: "Pago", WAIVED: "Isento" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default async function AppointmentPage({ params }: PageProps<"/agenda/[id]">) {
  const { id } = await params;
  const actor = await requireActor();

  // organizationId no where = isolamento de tenant; id de outra org -> 404.
  const a = await db.appointment.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      patient: { select: { id: true, name: true, whatsapp: true, email: true, preferredPaymentMethod: true, needsReceipt: true } },
      professional: { select: { displayName: true, onlineFixedLink: true, organization: { select: { timezone: true } } } },
      series: { select: { id: true, frequency: true, isActive: true } },
      clinicalNotes: { where: { kind: "EVOLUTION", deletedAt: null }, select: { id: true } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!a) notFound();

  const tz = a.professional.organization.timezone;
  const day = toLocalFields(a.startsAt, tz).date;
  const badge = TONE_BADGE[STATUS_TONE[a.status]];

  return (
    <>
      <PageHeader
        title={a.patient.name}
        description={`${a.serviceNameSnapshot} · ${formatDateTimeBR(a.startsAt, tz)}–${slotLabelInTz(a.endsAt, tz)}`}
        actions={
          <Link href={`/agenda?view=day&date=${day}`} className="btn-ghost">
            ← Agenda do dia
          </Link>
        }
      />

      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Status</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}>{STATUS_LABEL[a.status]}</span>
            </div>
            <StatusActions id={a.id} status={a.status} inSeries={!!a.series?.isActive} />
            {a.cancelReason && (
              <p className="mt-3 text-xs text-text-muted">
                Motivo do cancelamento: {a.cancelReason}
              </p>
            )}
          </section>

          <section className="card">
            <h2 className="mb-2 text-base font-semibold">Detalhes</h2>
            <dl className="divide-y divide-border">
              <Row label="Serviço">{a.serviceNameSnapshot}</Row>
              <Row label="Modalidade">{a.modality === "ONLINE" ? "Online" : "Presencial"}</Row>
              <Row label="Duração">{a.durationMinutes} min</Row>
              {canViewFinancials(actor, a.professionalId) && (
                <Row label="Valor">
                  {formatBRL(a.priceCents)} · <span className="text-text-muted">{PAYMENT_LABEL[a.paymentStatus]}</span>
                </Row>
              )}
              <Row label="Origem">
                {a.source === "PUBLIC_PAGE" ? "Página pública" : a.source === "RECURRING" ? "Recorrência" : "Manual"}
                {a.series && (
                  <span className="text-text-muted">
                    {" "}· série {a.series.frequency === "WEEKLY" ? "semanal" : "quinzenal"}
                    {!a.series.isActive && " (encerrada)"}
                  </span>
                )}
              </Row>
              {a.patientNote && <Row label="Observação do paciente">{a.patientNote}</Row>}
              {a.confirmedAt && <Row label="Confirmado em">{formatDateTimeBR(a.confirmedAt, tz)}</Row>}
              {a.completedAt && <Row label="Concluído em">{formatDateTimeBR(a.completedAt, tz)}</Row>}
            </dl>
          </section>

          {a.modality === "ONLINE" && (
            <section className="card">
              <h2 className="mb-3 text-base font-semibold">Sessão online</h2>
              {(a.onlineLink ?? a.professional.onlineFixedLink) && (
                <a
                  href={a.onlineLink ?? a.professional.onlineFixedLink ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary mb-4"
                >
                  Abrir sala ↗
                </a>
              )}
              <OnlineLinkForm id={a.id} link={a.onlineLink} fixedLink={a.professional.onlineFixedLink} />
            </section>
          )}

          <section className="card">
            <AdminNoteForm id={a.id} note={a.adminNote} />
          </section>

          {!a.status.startsWith("CANCELLED") && a.status !== "EXPIRED" && (await canWriteFor(actor, a.patient.id, a.professionalId)) && (
            <section className="card flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Evolução clínica</h2>
                <p className="text-sm text-text-muted">
                  {a.clinicalNotes.length > 0 ? "Registrada no prontuário." : "Ainda não registrada para esta sessão."}
                </p>
              </div>
              <Link href={`/pacientes/${a.patient.id}/prontuario${a.clinicalNotes.length > 0 ? "" : `?sessao=${a.id}`}`} className={a.clinicalNotes.length > 0 ? "btn-ghost" : "btn-primary"}>
                {a.clinicalNotes.length > 0 ? "Ver prontuário" : "Registrar evolução"}
              </Link>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {canViewFinancials(actor, a.professionalId) && (
            <PaymentSection
              appointmentId={a.id}
              priceCents={a.priceCents}
              paymentStatus={a.paymentStatus}
              payments={a.payments.map((p) => ({ id: p.id, amountCents: p.amountCents, method: p.method, paidAt: p.paidAt.toISOString(), note: p.note }))}
              preferredMethod={a.patient.preferredPaymentMethod}
              needsReceipt={a.patient.needsReceipt}
            />
          )}
          <section className="card">
            <h2 className="mb-3 text-base font-semibold">Paciente</h2>
            <p className="font-medium">{a.patient.name}</p>
            <p className="mt-1 text-sm text-text-muted">{a.patient.whatsapp}</p>
            {a.patient.email && <p className="text-sm text-text-muted">{a.patient.email}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <a
                href={`https://wa.me/${a.patient.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
              >
                Abrir WhatsApp ↗
              </a>
              <Link href={`/pacientes/${a.patient.id}`} className="btn-ghost">
                Ficha do paciente
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
