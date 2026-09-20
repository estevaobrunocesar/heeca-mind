import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { STATUS_LABEL } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canViewFinancials } from "@/lib/permissions";
import { avgCents, clientCohorts, groupSum, pct, surveySummary, workingMinutes } from "@/lib/reports/rules";
import { surveyResults } from "@/lib/reports/service";
import { requireActor } from "@/lib/session";
import { addDaysCivil } from "@/lib/availability";
import { dateTimeInTz, formatDateBR, todayCivilAndMonth } from "@/lib/time";

export const metadata: Metadata = { title: "Relatórios" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Bars({ rows, money }: { rows: Array<{ key: string; total: number; count: number }>; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex justify-between">
            <span>{r.key}</span>
            <span className="tabular-nums">
              {money ? formatBRL(r.total) : r.total} <span className="text-xs text-text-muted">· {r.count}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-surface-muted">
            <div className="h-1.5 rounded bg-primary" style={{ width: `${Math.round((r.total / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Indicadores do §27. Cada número traz "como é calculado" — sem caixa-preta. */
export default async function ReportsPage({ searchParams }: PageProps<"/relatorios">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true, type: true } });
  const tz = org.timezone;
  const { month: currentMonth } = todayCivilAndMonth(new Date(), tz);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth;
  const [y, m] = month.split("-").map(Number);
  const fromISO = `${month}-01`;
  const toISO = addDaysCivil(`${addMonths(month, 1)}-01`, -1);
  const from = dateTimeInTz(fromISO, "00:00", tz);
  const to = dateTimeInTz(`${addMonths(month, 1)}-01`, "00:00", tz);
  const now = new Date();

  // Escopo: OWNER/FINANCE = organização inteira (ou profissional selecionado); demais = o próprio.
  const orgWide = actor.role === "OWNER" || actor.role === "FINANCE";
  const proId = typeof sp.professional === "string" ? sp.professional : orgWide ? null : actor.activeProfessionalId;
  if (!orgWide && !proId) return <EmptyState title="Sem perfil profissional" description="Relatórios são por profissional." />;
  if (proId && !orgWide && !canViewFinancials(actor, proId) && actor.role !== "PROFESSIONAL") return <EmptyState title="Sem acesso" description="Relatórios financeiros são do profissional ou do responsável." />;
  const scope = proId ? { professionalId: proId } : { organizationId: actor.organizationId };
  const showMoney = proId ? canViewFinancials(actor, proId) : orgWide;

  const [appts, payments, patients, pros, surveys, waitlist] = await Promise.all([
    db.appointment.findMany({ where: { ...scope, startsAt: { gte: from, lt: to } }, select: { status: true, modality: true, priceCents: true, paymentStatus: true, durationMinutes: true, serviceNameSnapshot: true, professional: { select: { displayName: true } } } }),
    showMoney ? db.payment.findMany({ where: { OR: [{ appointment: scope }, { packagePurchase: scope }], paidAt: { gte: from, lt: to } }, select: { amountCents: true, method: true, appointment: { select: { serviceNameSnapshot: true, professional: { select: { displayName: true } } } }, packagePurchase: { select: { nameSnapshot: true, professional: { select: { displayName: true } } } } } }) : Promise.resolve([]),
    db.patient.findMany({
      where: { organizationId: actor.organizationId, ...(proId ? { appointments: { some: { professionalId: proId } } } : {}) },
      select: { createdAt: true, followUpStatus: true, lastCompletedAt: true, deletedAt: true, _count: { select: { appointments: { where: { status: "COMPLETED", ...(proId ? { professionalId: proId } : {}) } }, recurringSeries: { where: { isActive: true } } } } },
    }),
    db.professional.findMany({ where: { organizationId: actor.organizationId, isActive: true, ...(proId ? { id: proId } : {}) }, select: { id: true, displayName: true, availability: { select: { weekday: true, startTime: true, endTime: true } }, policy: { select: { reactivationAfterDays: true } } } }),
    proId ? surveyResults(actor, proId, { from, to }) : db.experienceSurvey.findMany({ where: { organizationId: actor.organizationId, answeredAt: { gte: from, lt: to } }, orderBy: { answeredAt: "desc" }, select: { id: true, score: true, comment: true, answeredAt: true, patient: { select: { name: true } } } }),
    db.waitlistEntry.count({ where: { organizationId: actor.organizationId, status: "WAITING", ...(proId ? { professionalId: proId } : {}) } }),
  ]);

  const completed = appts.filter((a) => a.status === "COMPLETED");
  const noShow = appts.filter((a) => a.status === "NO_SHOW");
  const cancelled = appts.filter((a) => a.status.startsWith("CANCELLED") || a.status === "EXPIRED");
  const held = appts.filter((a) => ["COMPLETED", "NO_SHOW", "CONFIRMED", "IN_PROGRESS", "PENDING", "AWAITING_CONFIRMATION", "AWAITING_PAYMENT"].includes(a.status));
  const bookedMinutes = held.reduce((s, a) => s + a.durationMinutes, 0);
  const capacity = pros.reduce((s, p) => s + workingMinutes(p.availability, fromISO, toISO), 0);
  const received = payments.reduce((s, p) => s + p.amountCents, 0);
  const receivedSessions = payments.filter((p) => p.appointment).reduce((s, p) => s + p.amountCents, 0);
  const billableCompleted = completed.filter((a) => a.paymentStatus !== "WAIVED" && a.paymentStatus !== "PACKAGE").length;
  const cohorts = clientCohorts(patients.map((p) => ({ createdAt: p.createdAt, followUpStatus: p.followUpStatus, lastCompletedAt: p.lastCompletedAt, deletedAt: p.deletedAt, completedCount: p._count.appointments, hasActiveSeries: p._count.recurringSeries > 0 })), { from, to }, now, pros[0]?.policy?.reactivationAfterDays ?? 90);
  const byPro = groupSum(payments, (p) => p.appointment?.professional.displayName ?? p.packagePurchase?.professional.displayName ?? "—", (p) => p.amountCents);
  const byService = groupSum(payments, (p) => p.appointment?.serviceNameSnapshot ?? (p.packagePurchase ? `Pacote: ${p.packagePurchase.nameSnapshot}` : "—"), (p) => p.amountCents);
  const byStatus = groupSum(appts, (a) => STATUS_LABEL[a.status], () => 1);
  const survey = surveySummary(surveys.map((s) => s.score).filter((s): s is number => s !== null));
  const allPros = orgWide ? await db.professional.findMany({ where: { organizationId: actor.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true } }) : [];
  const link = (q: Record<string, string>) => `/relatorios?${new URLSearchParams({ month, ...(proId ? { professional: proId } : {}), ...q }).toString()}`;

  return (
    <>
      <PageHeader title="Relatórios" description="Indicadores administrativos do mês. Nada aqui usa conteúdo clínico." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ month: addMonths(month, -1) })} className="btn-ghost px-2" aria-label="Mês anterior">
          ←
        </Link>
        <Link href={link({ month: currentMonth })} className="btn-ghost">
          Mês atual
        </Link>
        <Link href={link({ month: addMonths(month, 1) })} className="btn-ghost px-2" aria-label="Próximo mês">
          →
        </Link>
        <h2 className="ml-2 text-base font-medium">
          {MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)} de {y}
        </h2>
        {orgWide && allPros.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            <Link href={`/relatorios?month=${month}`} className={`rounded-md px-3 py-1.5 text-sm ${!proId ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:text-text"}`}>
              Toda a clínica
            </Link>
            {allPros.map((p) => (
              <Link key={p.id} href={`/relatorios?month=${month}&professional=${p.id}`} className={`rounded-md px-3 py-1.5 text-sm ${p.id === proId ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:text-text"}`}>
                {p.displayName}
              </Link>
            ))}
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-base font-semibold">Sessões e agenda</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi label="Sessões realizadas" value={String(completed.length)} hint={`${noShow.length} falta(s) · ${cancelled.length} cancelamento(s)`} />
          <Kpi label="Comparecimento" value={pct(completed.length, completed.length + noShow.length) === null ? "—" : `${pct(completed.length, completed.length + noShow.length)}%`} hint="concluídas ÷ (concluídas + faltas)" />
          <Kpi label="Taxa de ocupação" value={pct(bookedMinutes, capacity) === null ? "—" : `${Math.min(100, pct(bookedMinutes, capacity)!)}%`} hint={`${Math.round(bookedMinutes / 60)} h ocupadas de ${Math.round(capacity / 60)} h de grade`} />
          <Kpi label="Lista de espera" value={String(waitlist)} hint="pessoas aguardando horário" />
        </div>
      </section>

      {showMoney && (
        <section className="mt-6">
          <h2 className="mb-2 text-base font-semibold">Faturamento</h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Recebido no mês" value={formatBRL(received)} hint={`${payments.length} pagamento(s), sessões e pacotes`} />
            <Kpi label="Ticket médio" value={avgCents(receivedSessions, billableCompleted) === null ? "—" : formatBRL(avgCents(receivedSessions, billableCompleted)!)} hint="recebido de sessões ÷ sessões concluídas cobradas (pacotes fora)" />
            <Kpi label="No-show" value={pct(noShow.length, completed.length + noShow.length) === null ? "—" : `${pct(noShow.length, completed.length + noShow.length)}%`} hint={`${noShow.length} falta(s)`} />
            <Kpi label="Cancelamentos" value={pct(cancelled.length, appts.length) === null ? "—" : `${pct(cancelled.length, appts.length)}%`} hint={`${cancelled.length} de ${appts.length} agendadas`} />
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="card">
              <h3 className="mb-3 text-sm font-medium">Receita por profissional</h3>
              {byPro.length ? <Bars rows={byPro} money /> : <p className="text-sm text-text-muted">Sem recebimentos no mês.</p>}
            </div>
            <div className="card">
              <h3 className="mb-3 text-sm font-medium">Receita por serviço</h3>
              {byService.length ? <Bars rows={byService} money /> : <p className="text-sm text-text-muted">Sem recebimentos no mês.</p>}
            </div>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-base font-semibold">Clientes</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Kpi label="Novos" value={String(cohorts.new)} hint="cadastrados no mês" />
          <Kpi label="Ativos" value={String(cohorts.active)} hint="em acompanhamento" />
          <Kpi label="Recorrentes" value={String(cohorts.recurring)} hint="≥ 3 sessões ou série ativa" />
          <Kpi label="Inativos" value={String(cohorts.inactive)} hint={`ativos sem sessão há ${pros[0]?.policy?.reactivationAfterDays ?? 90}+ dias`} />
          <Kpi label="Retenção" value={cohorts.retentionPct === null ? "—" : `${cohorts.retentionPct}%`} hint="voltaram para a 2ª sessão" />
        </div>
        {cohorts.inactive > 0 && proId && (
          <p className="mt-2 text-sm">
            <Link href={`/pacientes/reativacao?professional=${proId}`} className="text-primary hover:underline">
              Ver lista de reativação →
            </Link>
          </p>
        )}
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h3 className="mb-3 text-sm font-medium">Sessões por status</h3>
          {byStatus.length ? <Bars rows={byStatus} /> : <p className="text-sm text-text-muted">Nenhuma sessão no mês.</p>}
        </div>
        <div className="card">
          <h3 className="mb-1 text-sm font-medium">Pesquisa de experiência</h3>
          {survey.count === 0 ? (
            <p className="text-sm text-text-muted">Nenhuma resposta no mês. Ative em Configurações → Políticas.</p>
          ) : (
            <>
              <p className="text-2xl font-semibold tabular-nums">
                {survey.avg} <span className="text-sm font-normal text-text-muted">/ 10 · {survey.count} resposta(s) · {survey.promoters} promotor(es) · {survey.detractors} detrator(es)</span>
              </p>
              <ul className="mt-3 divide-y divide-border text-sm">
                {surveys
                  .filter((s) => s.comment)
                  .slice(0, 8)
                  .map((s) => (
                    <li key={s.id} className="py-2">
                      <span className="font-medium">{s.score}</span> · {s.patient.name} · {s.answeredAt ? formatDateBR(s.answeredAt, tz) : ""}
                      <p className="text-text-muted">{s.comment}</p>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
