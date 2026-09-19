import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { addDaysCivil, todayCivil, weekdayOfCivilDate } from "@/lib/availability";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { dateTimeInTz } from "@/lib/time";
import { DayView, MonthView, WeekView } from "./calendar-views";

export const metadata: Metadata = { title: "Agenda" };

type View = "day" | "week" | "month";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function parseView(v: unknown): View {
  return v === "week" || v === "month" ? v : "day";
}
function parseDate(v: unknown, fallback: string): string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
}
function startOfWeek(d: string) {
  return addDaysCivil(d, -((weekdayOfCivilDate(d) + 6) % 7)); // segunda
}
function startOfMonth(d: string) {
  return `${d.slice(0, 7)}-01`;
}
function addMonths(d: string, n: number) {
  const [y, m] = d.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}
function longDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} de ${MONTHS[m - 1]} de ${y}`;
}

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const todayISO = todayCivil(new Date(), tz);

  const view = parseView(sp.view);
  const date = parseDate(sp.date, todayISO);
  const skipped = typeof sp.skipped === "string" ? Number(sp.skipped) : 0;

  // Intervalo civil exibido.
  let fromISO: string;
  let toISO: string;
  let title: string;
  let prev: string;
  let next: string;
  if (view === "day") {
    fromISO = toISO = date;
    title = longDate(date);
    prev = addDaysCivil(date, -1);
    next = addDaysCivil(date, 1);
  } else if (view === "week") {
    fromISO = startOfWeek(date);
    toISO = addDaysCivil(fromISO, 6);
    title = `${fromISO.slice(8)}/${fromISO.slice(5, 7)} – ${toISO.slice(8)}/${toISO.slice(5, 7)}`;
    prev = addDaysCivil(fromISO, -7);
    next = addDaysCivil(fromISO, 7);
  } else {
    fromISO = addDaysCivil(startOfMonth(date), -7);
    toISO = addDaysCivil(startOfMonth(date), 42);
    const [y, m] = date.split("-").map(Number);
    title = `${MONTHS[m - 1]} de ${y}`;
    prev = addMonths(date, -1);
    next = addMonths(date, 1);
  }

  const rangeStart = dateTimeInTz(fromISO, "00:00", tz);
  const rangeEnd = dateTimeInTz(addDaysCivil(toISO, 1), "00:00", tz);

  // Profissional: o próprio; recepção/dono sem perfil vê toda a organização.
  const proFilter = actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId };

  const [appointments, blocks, rules] = await Promise.all([
    db.appointment.findMany({
      where: { ...proFilter, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        modality: true,
        serviceNameSnapshot: true,
        patient: { select: { name: true } },
      },
    }),
    db.scheduleBlock.findMany({
      where: {
        ...(actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { professional: { organizationId: actor.organizationId } }),
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
      },
      select: { startsAt: true, endsAt: true, type: true, reason: true },
    }),
    actor.activeProfessionalId
      ? db.availabilityRule.findMany({ where: { professionalId: actor.activeProfessionalId }, select: { weekday: true, startTime: true, endTime: true } })
      : Promise.resolve([]),
  ]);

  const viewLink = (v: View, d = date) => `/agenda?view=${v}&date=${d}`;
  const tab = (v: View, label: string) => (
    <Link
      href={viewLink(v)}
      className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-surface font-medium text-text shadow-sm" : "text-text-muted hover:text-text"}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Agenda"
        actions={
          <Link href={`/agenda/novo?date=${date}`} className="btn-primary">
            Nova sessão
          </Link>
        }
      />

      {skipped > 0 && (
        <div role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          Série criada. {skipped} horário(s) com conflito foram pulados.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={viewLink(view, prev)} className="btn-ghost px-2" aria-label="Anterior">
            ←
          </Link>
          <Link href={viewLink(view, todayISO)} className="btn-ghost">
            Hoje
          </Link>
          <Link href={viewLink(view, next)} className="btn-ghost px-2" aria-label="Próximo">
            →
          </Link>
          <h2 className="ml-2 text-base font-medium">{title.charAt(0).toUpperCase() + title.slice(1)}</h2>
        </div>
        <div className="flex rounded-lg bg-surface-muted p-1">
          {tab("day", "Dia")}
          {tab("week", "Semana")}
          {tab("month", "Mês")}
        </div>
      </div>

      {!actor.activeProfessionalId && appointments.length === 0 ? (
        <EmptyState title="Sem sessões no período" description="Nenhum profissional da organização tem sessões neste intervalo." />
      ) : view === "day" ? (
        <DayView dateISO={date} tz={tz} appointments={appointments} blocks={blocks} rules={rules} todayISO={todayISO} />
      ) : view === "week" ? (
        <WeekView weekStartISO={fromISO} tz={tz} appointments={appointments} blocks={blocks} rules={rules} todayISO={todayISO} />
      ) : (
        <MonthView monthISO={startOfMonth(date)} tz={tz} appointments={appointments} blocks={blocks} rules={rules} todayISO={todayISO} />
      )}
    </>
  );
}
