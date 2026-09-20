import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canDeletePatient, canViewAnyFinancials } from "@/lib/permissions";
import { canOpenClinicalRecord } from "@/lib/clinical";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";
import { FOLLOW_UP_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { describeCommsPrefs, parseCommsPrefs } from "@/lib/comms-prefs";
import { PatientDangerZone } from "./danger-zone";
import { anonymizationDueAt } from "@/lib/lgpd/retention";
import { formatDateBR } from "@/lib/time";
import { canManageSchedule } from "@/lib/permissions";
import { listRequestsForPatient } from "@/lib/forms";
import { FormsPanel } from "./formularios/forms-panel";
import { listPurchasesForPatient } from "@/lib/packages/service";
import { PackagesPanel } from "./pacotes/packages-panel";

export const metadata: Metadata = { title: "Paciente" };

const TONE_BADGE = {
  neutral: "bg-surface-muted text-text",
  warning: "bg-warning/15 text-warning",
  success: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-muted text-text-muted",
} as const;

const MODALITY_LABEL = { IN_PERSON: "Presencial", ONLINE: "Online", HYBRID: "Alterna" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-surface-muted px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default async function PatientPage({ params }: PageProps<"/pacientes/[id]">) {
  const { id } = await params;
  const actor = await requireActor();

  const p = await db.patient.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      organization: { select: { timezone: true, retentionYears: true } },
      appointments: {
        orderBy: { startsAt: "desc" },
        take: 100,
        select: {
          id: true,
          startsAt: true,
          status: true,
          modality: true,
          serviceNameSnapshot: true,
          priceCents: true,
          paymentStatus: true,
          professional: { select: { displayName: true } },
        },
      },
      recurringSeries: { where: { isActive: true }, select: { id: true, frequency: true, weekday: true, startTime: true } },
      tags: { select: { tag: { select: { id: true, name: true } } }, orderBy: { tag: { name: "asc" } } },
    },
  });
  if (!p) notFound();
  const address = [p.addressLine, [p.addressCity, p.addressState].filter(Boolean).join("/"), p.addressZip ? p.addressZip.replace(/^(\d{5})(\d{3})$/, "$1-$2") : null].filter(Boolean).join(" · ");

  const tz = p.organization.timezone;
  const now = new Date();
  const age = p.birthDate ? Math.floor((now.getTime() - p.birthDate.getTime()) / (365.25 * 86_400_000)) : null;
  const completed = p.appointments.filter((a) => a.status === "COMPLETED").length;
  const noShow = p.appointments.filter((a) => a.status === "NO_SHOW").length;
  const cancelled = p.appointments.filter((a) => a.status.startsWith("CANCELLED")).length;
  const attendance = completed + noShow > 0 ? Math.round((completed / (completed + noShow)) * 100) : null;
  const upcoming = p.appointments.filter((a) => a.startsAt > now && ACTIVE_STATUSES.includes(a.status as (typeof ACTIVE_STATUSES)[number])).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const pendingPayment = p.appointments.filter((a) => a.status === "COMPLETED" && a.paymentStatus === "PENDING").reduce((s, a) => s + a.priceCents, 0);
  const purchases = await listPurchasesForPatient(actor, p.id);
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const showMoney = canViewAnyFinancials(actor);
  const canOpenRecord = !p.anonymizedAt && (await canOpenClinicalRecord(actor, p.id));
  const formsPro = actor.activeProfessionalId;
  const canSendForms = !!formsPro && !p.deletedAt && !p.anonymizedAt && canManageSchedule(actor, formsPro);
  const catalog = actor.activeProfessionalId
    ? (await db.package.findMany({ where: { professionalId: actor.activeProfessionalId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, sessionsCount: true, priceCents: true, validityDays: true } })).map((k) => ({ ...k }))
    : [];
  const [formRequests, formTemplates] = await Promise.all([
    listRequestsForPatient(actor, p.id),
    canSendForms ? db.formTemplate.findMany({ where: { professionalId: formsPro!, isActive: true }, orderBy: { title: "asc" }, select: { id: true, title: true, dataClass: true } }) : Promise.resolve([]),
  ]);
  const lastAppointmentAt = p.appointments[0]?.startsAt ?? null; // lista ordenada desc
  const due = anonymizationDueAt({ deletedAt: p.deletedAt, lastAppointmentAt, retentionYears: p.organization.retentionYears });

  return (
    <>
      <PageHeader
        title={p.name}
        description={p.anonymizedAt ? `Anonimizado em ${formatDateTimeBR(p.anonymizedAt, tz)}` : p.deletedAt ? `Excluído em ${formatDateTimeBR(p.deletedAt, tz)}` : `${FOLLOW_UP_LABEL[p.followUpStatus]}${p.firstAppointmentAt ? ` · paciente desde ${formatDateTimeBR(p.firstAppointmentAt, tz).slice(0, 10)}` : ""}`}
        actions={
          <div className="flex gap-2">
            <Link href="/pacientes" className="btn-ghost">
              ← Pacientes
            </Link>
            {canDeletePatient(actor) && !p.anonymizedAt && (
              <a href={`/pacientes/${p.id}/export`} className="btn-ghost" title="Dados do titular (LGPD art. 18)">
                Exportar dados
              </a>
            )}
            {!p.deletedAt && (
              <>
                <Link href={`/pacientes/${p.id}/editar`} className="btn-ghost">
                  Editar
                </Link>
                <Link href={`/agenda/novo?patientId=${p.id}`} className="btn-primary">
                  Nova sessão
                </Link>
              </>
            )}
          </div>
        }
      />

      <div className="grid max-w-6xl gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Sessões realizadas" value={completed} />
            <Stat label="Comparecimento" value={attendance === null ? "—" : `${attendance}%`} />
            <Stat label="Faltas" value={noShow} />
            <Stat label="Cancelamentos" value={cancelled} />
          </section>

          {upcoming.length > 0 && (
            <section className="card">
              <h2 className="mb-2 text-base font-semibold">Próximas sessões</h2>
              <ul className="divide-y divide-border">
                {upcoming.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <Link href={`/agenda/${a.id}`} className="hover:text-primary hover:underline">
                      {formatDateTimeBR(a.startsAt, tz)} · {a.serviceNameSnapshot} · {a.modality === "ONLINE" ? "Online" : "Presencial"}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_BADGE[STATUS_TONE[a.status]]}`}>{STATUS_LABEL[a.status]}</span>
                  </li>
                ))}
              </ul>
              {p.recurringSeries.length > 0 && (
                <p className="mt-3 text-xs text-text-muted">
                  Recorrência ativa: {p.recurringSeries.map((s) => `${s.frequency === "WEEKLY" ? "toda" : "a cada duas"} ${WD[s.weekday]} às ${s.startTime}`).join("; ")}.
                </p>
              )}
            </section>
          )}

          <section className="card">
            <h2 className="mb-2 text-base font-semibold">Histórico</h2>
            {p.appointments.length === 0 ? (
              <p className="text-sm text-text-muted">Nenhuma sessão registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-text-muted">
                    <tr>
                      <th className="py-2 pr-4">Data</th>
                      <th className="py-2 pr-4">Atendimento</th>
                      <th className="py-2 pr-4">Status</th>
                      {showMoney && <th className="py-2 pr-4 text-right">Valor</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {p.appointments.map((a) => (
                      <tr key={a.id}>
                        <td className="whitespace-nowrap py-2 pr-4">
                          <Link href={`/agenda/${a.id}`} className="hover:text-primary hover:underline">
                            {formatDateTimeBR(a.startsAt, tz)}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          {a.serviceNameSnapshot}
                          <span className="block text-xs text-text-muted">
                            {a.modality === "ONLINE" ? "Online" : "Presencial"} · {a.professional.displayName}
                          </span>
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_BADGE[STATUS_TONE[a.status]]}`}>{STATUS_LABEL[a.status]}</span>
                        </td>
                        {showMoney && (
                        <td className="whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                          {formatBRL(a.priceCents)}
                          <span className={`block text-xs ${a.paymentStatus === "PAID" ? "text-success" : a.paymentStatus === "WAIVED" ? "text-text-muted" : a.status === "COMPLETED" ? "text-warning" : "text-text-muted"}`}>
                            {a.paymentStatus === "PAID" ? "pago" : a.paymentStatus === "WAIVED" ? "isento" : a.paymentStatus === "PACKAGE" ? "pacote" : "pendente"}
                          </span>
                        </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card">
            <h2 className="mb-2 text-base font-semibold">Contato</h2>
            <dl className="divide-y divide-border">
              <Row label="WhatsApp">{p.whatsapp}</Row>
              {p.phone && <Row label="Telefone">{p.phone}</Row>}
              {p.email && <Row label="E-mail">{p.email}</Row>}
              {p.birthDate && <Row label="Nascimento">{formatDateBR(p.birthDate, "UTC")}{age !== null && ` · ${age} anos`}</Row>}
              {address && <Row label="Endereço">{address}</Row>}
              {p.bestContactTime && <Row label="Melhor horário">{p.bestContactTime}</Row>}
              {(p.emergencyContactName || p.emergencyContactPhone) && (
                <Row label="Emergência">{[p.emergencyContactName, p.emergencyContactPhone].filter(Boolean).join(" · ")}</Row>
              )}
              <Row label="Comunicação">{describeCommsPrefs(parseCommsPrefs(p.commsPrefs))}</Row>
            </dl>
            {p.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.tags.map(({ tag }) => (
                  <Link key={tag.id} href={`/pacientes?tag=${encodeURIComponent(tag.name)}`} className="rounded-md bg-primary-soft px-2 py-0.5 text-xs text-primary hover:underline">
                    {tag.name}
                  </Link>
                ))}
              </div>
            )}
            {!p.anonymizedAt && <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn-ghost mt-3 w-full">
              Abrir WhatsApp ↗
            </a>}
          </section>

          <section className="card">
            <h2 className="mb-2 text-base font-semibold">Administrativo</h2>
            <dl className="divide-y divide-border">
              <Row label="Modalidade habitual">{p.usualModality ? MODALITY_LABEL[p.usualModality] : "—"}</Row>
              <Row label="Pagamento">{p.preferredPaymentMethod ? PAYMENT_METHOD_LABEL[p.preferredPaymentMethod] : "—"}</Row>
              <Row label="Recibo">{p.needsReceipt ? "Sim" : "Não"}</Row>
              {showMoney && pendingPayment > 0 && (
                <Row label="Em aberto">
                  <span className="font-medium text-warning">{formatBRL(pendingPayment)}</span>
                </Row>
              )}
              {p.lgpdConsentAt && <Row label="Consentimento LGPD">{formatDateTimeBR(p.lgpdConsentAt, tz)}</Row>}
            </dl>
            {p.adminNotes && (
              <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">
                <p className="mb-1 text-xs uppercase tracking-wide text-text-muted">Observações</p>
                <p className="whitespace-pre-wrap">{p.adminNotes}</p>
              </div>
            )}
          </section>

          <PackagesPanel
            patientId={p.id}
            canSell={!p.deletedAt && !p.anonymizedAt && !!actor.activeProfessionalId && canManageSchedule(actor, actor.activeProfessionalId)}
            showMoney={showMoney}
            tz={tz}
            purchases={purchases.map((x) => ({ id: x.id, name: x.nameSnapshot, professional: x.professional.displayName, total: x.sessionsTotal, balance: x.balance, status: x.effective, expiresAt: x.expiresAt.toISOString(), priceCents: x.priceCents, paidCents: x.paidCents, paymentStatus: x.paymentStatus }))}
            catalog={catalog}
          />

          <section className="card">
            <h2 className="mb-1 text-base font-semibold">Prontuário</h2>
            {canOpenRecord ? (
              <>
                <p className="text-sm text-text-muted">Evoluções, anotações e avaliações — cifradas, visíveis só para você.</p>
                <Link href={`/pacientes/${p.id}/prontuario`} className="btn-primary mt-3 w-full">
                  Abrir prontuário
                </Link>
              </>
            ) : (
              <p className="text-sm text-text-muted">Acesso restrito ao profissional responsável ou a quem ele delegar (sigilo, CFP art. 9).</p>
            )}
          </section>

          <FormsPanel
            patientId={p.id}
            appointmentId={null}
            canSend={canSendForms}
            templates={formTemplates}
            requests={formRequests.map((r) => ({ id: r.id, title: r.title, dataClass: r.dataClass, status: r.status, sentAt: formatDateBR(r.sentAt, tz), submittedAt: r.submittedAt ? formatDateBR(r.submittedAt, tz) : null, canRead: r.canRead }))}
          />

          {canDeletePatient(actor) && (
            <PatientDangerZone id={p.id} deleted={!!p.deletedAt} anonymized={!!p.anonymizedAt} anonymizationDue={due ? formatDateBR(due, tz) : null} />
          )}
        </aside>
      </div>
    </>
  );
}
