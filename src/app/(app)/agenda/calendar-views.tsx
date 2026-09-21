import Link from "next/link";
import type { AppointmentModality, AppointmentStatus } from "@/generated/prisma/enums";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { addDaysCivil, weekdayOfCivilDate } from "@/lib/availability";
import { hhmmToMinutes, slotLabelInTz, toLocalFields, WEEKDAY_SHORT } from "@/lib/time";

export type CalendarAppointment = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  modality: AppointmentModality;
  serviceNameSnapshot: string;
  patient: { name: string };
};

export type CalendarBlock = { startsAt: Date; endsAt: Date; type: "BLOCK" | "DAY_OFF" | "VACATION"; reason: string | null };

const TONE_CLASS = {
  neutral: "border-border bg-surface-muted text-text",
  warning: "border-warning/40 bg-warning/10 text-text",
  success: "border-primary/40 bg-primary-soft text-text",
  danger: "border-danger/40 bg-danger-soft text-text",
  muted: "border-border bg-surface text-text-muted line-through",
} as const;

const PX_PER_MIN = 1.1;

function gridBounds(rules: ReadonlyArray<{ startTime: string; endTime: string }>) {
  // Grade visual cobre a grade semanal com folga de 1h; mínimo 08–19.
  let min = 8 * 60;
  let max = 19 * 60;
  for (const r of rules) {
    min = Math.min(min, hhmmToMinutes(r.startTime) - 60);
    max = Math.max(max, hhmmToMinutes(r.endTime) + 60);
  }
  min = Math.max(0, Math.floor(min / 60) * 60);
  max = Math.min(24 * 60, Math.ceil(max / 60) * 60);
  return { min, max };
}

function minutesInDay(date: Date, tz: string) {
  return hhmmToMinutes(slotLabelInTz(date, tz));
}

export function AppointmentChip({ a, tz, compact = false }: { a: CalendarAppointment; tz: string; compact?: boolean }) {
  const tone = TONE_CLASS[STATUS_TONE[a.status]];
  return (
    <Link
      href={`/agenda/${a.id}`}
      className={`block overflow-hidden rounded-md border px-2 py-1 text-xs leading-tight transition ${tone}`}
      title={`${a.patient.name} · ${a.serviceNameSnapshot} · ${STATUS_LABEL[a.status]}`}
    >
      <span className="font-medium">
        {slotLabelInTz(a.startsAt, tz)} {a.patient.name}
      </span>
      {!compact && (
        <span className="block truncate text-[11px] text-text-muted">
          {a.modality === "ONLINE" ? "Online" : "Presencial"} · {a.serviceNameSnapshot}
        </span>
      )}
    </Link>
  );
}

/**
 * Coluna de um dia com posicionamento por minuto. Usada no dia e na semana.
 */
function DayColumn({
  dateISO,
  appointments,
  blocks,
  tz,
  bounds,
  openWindows,
  compact,
}: {
  dateISO: string;
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  tz: string;
  bounds: { min: number; max: number };
  openWindows: Array<{ startTime: string; endTime: string }>;
  compact: boolean;
}) {
  const height = (bounds.max - bounds.min) * PX_PER_MIN;
  const clamp = (m: number) => Math.min(Math.max(m, bounds.min), bounds.max);
  const top = (m: number) => (clamp(m) - bounds.min) * PX_PER_MIN;

  const dayAppts = appointments.filter((a) => toLocalFields(a.startsAt, tz).date === dateISO);
  const dayBlocks = blocks
    .map((b) => {
      // Recorta o bloqueio ao dia.
      const s = toLocalFields(b.startsAt, tz).date === dateISO ? minutesInDay(b.startsAt, tz) : 0;
      const e = toLocalFields(b.endsAt, tz).date === dateISO ? minutesInDay(b.endsAt, tz) : 24 * 60;
      const touches = toLocalFields(b.startsAt, tz).date <= dateISO && toLocalFields(b.endsAt, tz).date >= dateISO;
      return touches ? { ...b, s, e } : null;
    })
    .filter((b): b is CalendarBlock & { s: number; e: number } => b !== null);

  return (
    <div className="relative border-l border-border bg-surface-muted/60" style={{ height }}>
      {/* Faixas de atendimento (grade semanal) */}
      {openWindows.map((w, i) => (
        <div
          key={i}
          className="absolute inset-x-0 bg-surface"
          style={{ top: top(hhmmToMinutes(w.startTime)), height: (hhmmToMinutes(w.endTime) - hhmmToMinutes(w.startTime)) * PX_PER_MIN }}
        />
      ))}
      {/* Linhas de hora */}
      {Array.from({ length: (bounds.max - bounds.min) / 60 }, (_, i) => (
        <div key={i} className="absolute inset-x-0 border-t border-border/60" style={{ top: i * 60 * PX_PER_MIN }} />
      ))}
      {/* Bloqueios */}
      {dayBlocks.map((b, i) => (
        <div
          key={`b${i}`}
          className="absolute inset-x-0.5 rounded bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,rgba(0,0,0,0.05)_4px,rgba(0,0,0,0.05)_8px)] text-[10px] text-text-muted"
          style={{ top: top(b.s), height: Math.max(12, (clamp(b.e) - clamp(b.s)) * PX_PER_MIN) }}
          title={b.reason ?? undefined}
        >
          <span className="px-1">{b.type === "VACATION" ? "Férias" : b.type === "DAY_OFF" ? "Folga" : "Bloqueado"}</span>
        </div>
      ))}
      {/* Sessões */}
      {dayAppts.map((a) => {
        const s = minutesInDay(a.startsAt, tz);
        const e = s + (a.endsAt.getTime() - a.startsAt.getTime()) / 60_000;
        return (
          <div key={a.id} className="absolute inset-x-0.5" style={{ top: top(s), height: Math.max(22, (clamp(e) - clamp(s)) * PX_PER_MIN - 2) }}>
            <AppointmentChip a={a} tz={tz} compact={compact} />
          </div>
        );
      })}
    </div>
  );
}

function HourGutter({ bounds }: { bounds: { min: number; max: number } }) {
  return (
    <div className="relative w-12 shrink-0 text-right text-[11px] text-text-muted" style={{ height: (bounds.max - bounds.min) * PX_PER_MIN }}>
      {Array.from({ length: (bounds.max - bounds.min) / 60 }, (_, i) => (
        <div key={i} className={`absolute right-2 ${i === 0 ? "" : "-translate-y-1/2"}`} style={{ top: i * 60 * PX_PER_MIN }}>
          {String(bounds.min / 60 + i).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

type ViewProps = {
  tz: string;
  appointments: CalendarAppointment[];
  blocks: CalendarBlock[];
  rules: ReadonlyArray<{ weekday: number; startTime: string; endTime: string }>;
  todayISO: string;
};

export function DayView({ dateISO, tz, appointments, blocks, rules }: ViewProps & { dateISO: string }) {
  const bounds = gridBounds(rules);
  const wd = weekdayOfCivilDate(dateISO);
  return (
    <div className="card flex overflow-hidden p-0">
      <HourGutter bounds={bounds} />
      <div className="flex-1">
        <DayColumn
          dateISO={dateISO}
          appointments={appointments}
          blocks={blocks}
          tz={tz}
          bounds={bounds}
          openWindows={rules.filter((r) => r.weekday === wd)}
          compact={false}
        />
      </div>
    </div>
  );
}

export function WeekView({ weekStartISO, tz, appointments, blocks, rules, todayISO }: ViewProps & { weekStartISO: string }) {
  const bounds = gridBounds(rules);
  const days = Array.from({ length: 7 }, (_, i) => addDaysCivil(weekStartISO, i));
  return (
    <div className="card overflow-x-auto p-0">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-[3rem_repeat(7,1fr)] border-b border-border text-center text-xs">
          <div />
          {days.map((d) => (
            <div key={d} className={`py-2 ${d === todayISO ? "font-semibold text-primary" : "text-text-muted"}`}>
              {WEEKDAY_SHORT[weekdayOfCivilDate(d)]} <span className="text-text">{d.slice(8)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[3rem_repeat(7,1fr)]">
          <HourGutter bounds={bounds} />
          {days.map((d) => (
            <DayColumn
              key={d}
              dateISO={d}
              appointments={appointments}
              blocks={blocks}
              tz={tz}
              bounds={bounds}
              openWindows={rules.filter((r) => r.weekday === weekdayOfCivilDate(d))}
              compact
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function MonthView({ monthISO, tz, appointments, todayISO }: ViewProps & { monthISO: string }) {
  // monthISO = "YYYY-MM-01". Grade começa na segunda anterior ou igual ao dia 1.
  const first = monthISO;
  const wdFirst = weekdayOfCivilDate(first);
  const gridStart = addDaysCivil(first, -((wdFirst + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDaysCivil(gridStart, i));
  const month = first.slice(0, 7);

  const byDay = new Map<string, CalendarAppointment[]>();
  for (const a of appointments) {
    const d = toLocalFields(a.startsAt, tz).date;
    byDay.set(d, [...(byDay.get(d) ?? []), a]);
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-border text-center text-xs text-text-muted">
        {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
          <div key={wd} className="py-2">
            {WEEKDAY_SHORT[wd]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const inMonth = d.startsWith(month);
          const list = byDay.get(d) ?? [];
          return (
            <div key={d} className={`min-h-24 border-b border-r border-border p-1 ${inMonth ? "" : "bg-surface-muted/50"}`}>
              <Link
                href={`/agenda?view=day&date=${d}`}
                className={`mb-1 inline-block rounded px-1 text-xs ${d === todayISO ? "bg-primary font-semibold text-white" : inMonth ? "text-text" : "text-text-muted"}`}
              >
                {Number(d.slice(8))}
              </Link>
              <div className="space-y-0.5">
                {list.slice(0, 3).map((a) => (
                  <AppointmentChip key={a.id} a={a} tz={tz} compact />
                ))}
                {list.length > 3 && (
                  <Link href={`/agenda?view=day&date=${d}`} className="block px-1 text-[11px] text-text-muted hover:text-primary">
                    +{list.length - 3} mais
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
