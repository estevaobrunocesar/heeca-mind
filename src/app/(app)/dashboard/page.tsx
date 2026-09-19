import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { addDaysCivil } from "@/lib/availability";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canViewFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dateTimeInTz, slotLabelInTz, todayCivilAndMonth } from "@/lib/time";

export const metadata: Metadata = { title: "Início" };

const TONE_BADGE = {
  neutral: "bg-surface-muted text-text",
  warning: "bg-warning/15 text-warning",
  success: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-muted text-text-muted",
} as const;

function Stat({ label, value, hint, href, tone }: { label: string; value: string | number; hint?: string; href?: string; tone?: "warning" | "success" }) {
  const body = (
    <>
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card block transition hover:border-primary/40">
      {body}
    </Link>
  ) : (
    <div className="card">{body}</div>
  );
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const now = new Date();
  const { date: todayISO, month } = todayCivilAndMonth(now, tz);
  const dayStart = dateTimeInTz(todayISO, "00:00", tz);
  const dayEnd = dateTimeInTz(addDaysCivil(todayISO, 1), "00:00", tz);
  const monthStart = dateTimeInTz(`${month}-01`, "00:00", tz);
  const [y, m] = month.split("-").map(Number);
  const monthEnd = dateTimeInTz(`${m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`}-01`, "00:00", tz);

  const scope = actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId };
  const active = { in: [...ACTIVE_STATUSES] };
  const showMoney = actor.activeProfessionalId ? canViewFinancials(actor, actor.activeProfessionalId) : actor.role === "OWNER";

  const [todaySessions, nextSession, patientCount, confirmedUpcoming, pendingCount, monthAppts, rescheduleAudits, receivedMonth] = await Promise.all([
    db.appointment.findMany({
      where: { ...scope, startsAt: { gte: dayStart, lt: dayEnd }, status: { notIn: ["CANCELLED_BY_PATIENT", "CANCELLED_BY_PROFESSIONAL", "EXPIRED"] } },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, status: true, modality: true, serviceNameSnapshot: true, onlineLink: true, patient: { select: { name: true } } },
    }),
    db.appointment.findFirst({
      where: { ...scope, startsAt: { gte: now }, status: active },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true, serviceNameSnapshot: true, modality: true, patient: { select: { name: true } } },
    }),
    db.patient.count({ where: { organizationId: actor.organizationId, deletedAt: null, followUpStatus: "ACTIVE" } }),
    db.appointment.count({ where: { ...scope, status: "CONFIRMED", startsAt: { gte: now } } }),
    db.appointment.count({ where: { ...scope, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "RESCHEDULE_REQUESTED"] }, startsAt: { gte: now } } }),
    db.appointment.findMany({
      where: { ...scope, startsAt: { gte: monthStart, lt: monthEnd } },
      select: { status: true, modality: true, priceCents: true, paymentStatus: true },
    }),
    db.auditLog.count({ where: { organizationId: actor.organizationId, action: "appointment.reschedule", createdAt: { gte: monthStart, lt: monthEnd } } }),
    showMoney
      ? db.payment.aggregate({ where: { appointment: scope, paidAt: { gte: monthStart, lt: monthEnd } }, _sum: { amountCents: true } })
      : Promise.resolve({ _sum: { amountCents: 0 } }),
  ]);

  // Indicadores do mês
  const completed = monthAppts.filter((a) => a.status === "COMPLETED");
  const noShow = monthAppts.filter((a) => a.status === "NO_SHOW");
  const cancelled = monthAppts.filter((a) => a.status.startsWith("CANCELLED") || a.status === "EXPIRED");
  const attendance = completed.length + noShow.length > 0 ? Math.round((completed.length / (completed.length + noShow.length)) * 100) : null;
  const countable = monthAppts.filter((a) => ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT", "PENDING", "AWAITING_CONFIRMATION"].includes(a.status));
  const online = countable.filter((a) => a.modality === "ONLINE").length;
  const inPerson = countable.length - online;
  const forecast = monthAppts
    .filter((a) => ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT"].includes(a.status) && a.paymentStatus !== "WAIVED")
    .reduce((s, a) => s + a.priceCents, 0);
  const pendingMoney = completed.filter((a) => a.paymentStatus === "PENDING").reduce((s, a) => s + a.priceCents, 0);

  const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  return (
    <>
      <PageHeader
        title="Início"
        description={`${now.toLocaleDateString("pt-BR", { timeZone: tz, weekday: "long", day: "numeric", month: "long" })}`}
        actions={
          <Link href="/agenda/novo" className="btn-primary">
            Nova sessão
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          {/* Hoje */}
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Hoje · {todaySessions.length} sessão(ões)</h2>
              <Link href={`/agenda?view=day&date=${todayISO}`} className="text-sm text-text-muted hover:text-primary">
                Ver agenda →
              </Link>
            </div>
            {todaySessions.length === 0 ? (
              <p className="text-sm text-text-muted">Nenhuma sessão hoje.</p>
            ) : (
              <ul className="divide-y divide-border">
                {todaySessions.map((a) => {
                  const past = a.startsAt < now;
                  return (
                    <li key={a.id} className={`flex items-center justify-between gap-3 py-2 text-sm ${past && a.status === "CONFIRMED" ? "opacity-70" : ""}`}>
                      <Link href={`/agenda/${a.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                        <span className="w-12 shrink-0 font-medium tabular-nums">{slotLabelInTz(a.startsAt, tz)}</span>
                        <span className="truncate">
                          {a.patient.name}
                          <span className="text-text-muted"> · {a.serviceNameSnapshot}</span>
                        </span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs text-text-muted">{a.modality === "ONLINE" ? "Online" : "Presencial"}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${TONE_BADGE[STATUS_TONE[a.status]]}`}>{STATUS_LABEL[a.status]}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Indicadores do mês */}
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
              {MONTHS[m - 1]} — indicadores
            </h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Stat label="Realizadas" value={completed.length} hint={`${noShow.length} falta(s)`} />
              <Stat label="Comparecimento" value={attendance === null ? "—" : `${attendance}%`} hint="concluídas ÷ (concluídas + faltas)" tone={attendance !== null && attendance < 80 ? "warning" : undefined} />
              <Stat label="Cancelamentos" value={cancelled.length} hint={`${rescheduleAudits} reagendamento(s)`} />
              <Stat label="Online" value={online} hint={`${inPerson} presencial(is)`} />
              {showMoney && <Stat label="Faturamento previsto" value={formatBRL(forecast)} hint={`recebido: ${formatBRL(receivedMonth._sum.amountCents ?? 0)}`} href="/financeiro" />}
              {showMoney && <Stat label="A receber" value={formatBRL(pendingMoney)} hint="sessões concluídas sem pagamento" href="/financeiro" tone={pendingMoney > 0 ? "warning" : undefined} />}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card">
            <p className="text-xs uppercase tracking-wide text-text-muted">Próxima sessão</p>
            {nextSession ? (
              <Link href={`/agenda/${nextSession.id}`} className="mt-2 block hover:text-primary">
                <p className="font-medium">{nextSession.patient.name}</p>
                <p className="text-sm text-text-muted">
                  {nextSession.startsAt.toLocaleString("pt-BR", { timeZone: tz, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  {" · "}
                  {nextSession.modality === "ONLINE" ? "Online" : "Presencial"}
                </p>
                <p className="text-xs text-text-muted">{nextSession.serviceNameSnapshot}</p>
              </Link>
            ) : (
              <p className="mt-2 text-sm text-text-muted">Nenhuma sessão agendada.</p>
            )}
          </section>
          <Stat label="Pacientes ativos" value={patientCount} href="/pacientes?status=ACTIVE" />
          <Stat label="Confirmadas (futuras)" value={confirmedUpcoming} href="/agenda?view=week" />
          <Stat label="Aguardando ação" value={pendingCount} hint="pendentes, aguardando confirmação ou reagendamento" href="/agenda?view=week" tone={pendingCount > 0 ? "warning" : undefined} />
        </aside>
      </div>
    </>
  );
}
