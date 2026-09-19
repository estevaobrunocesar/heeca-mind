import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addDaysCivil, computeAvailableDays, computeAvailableSlots, slotLabel, todayCivil, weekdayOfCivilDate } from "@/lib/availability";
import { loadAvailabilityInput } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { WEEKDAY_SHORT } from "@/lib/time";
import { BookingForm } from "./booking-form";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MODALITY_LABEL = { IN_PERSON: "Presencial", ONLINE: "Online" } as const;

async function load(slug: string, serviceId: string) {
  return db.professional.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      displayName: true,
      showPrices: true,
      addressCity: true,
      organization: { select: { timezone: true } },
      scheduleSettings: { select: { maxBookingDaysAhead: true, minCancelHours: true } },
      policy: { select: { cancellationPolicy: true } },
      services: {
        where: { id: serviceId, isActive: true },
        take: 1,
        select: { id: true, name: true, description: true, durationMinutes: true, priceCents: true, modality: true, patientInstructions: true },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/agendar/[slug]/[serviceId]">): Promise<Metadata> {
  const { slug, serviceId } = await params;
  const p = await load(slug, serviceId);
  return { title: p?.services[0] ? `${p.services[0].name} · ${p.displayName}` : "Agendar" };
}

function monthOf(dateISO: string) {
  return dateISO.slice(0, 7);
}
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function lastDayOfMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function Step({ n, title, done }: { n: number; title: string; done?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">{n}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {done && <span className="text-sm text-text-muted">— {done}</span>}
    </div>
  );
}

export default async function ServiceBookingPage({ params, searchParams }: PageProps<"/agendar/[slug]/[serviceId]">) {
  const { slug, serviceId } = await params;
  const sp = await searchParams;
  const p = await load(slug, serviceId);
  const service = p?.services[0];
  if (!p || !service) notFound();

  const tz = p.organization.timezone;
  const todayISO = todayCivil(new Date(), tz);
  const maxAhead = p.scheduleSettings?.maxBookingDaysAhead ?? 60;
  const lastBookable = addDaysCivil(todayISO, maxAhead);

  // Passo 1: modalidade (só quando o serviço é híbrido)
  const modalityParam = sp.modality === "ONLINE" || sp.modality === "IN_PERSON" ? sp.modality : null;
  const modality = service.modality === "HYBRID" ? modalityParam : service.modality === "ONLINE" ? "ONLINE" : "IN_PERSON";

  const base = `/agendar/${slug}/${service.id}`;
  const withQuery = (q: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${base}?${s}` : base;
  };

  // Passo 2/3: mês e dia
  const monthParam = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : monthOf(todayISO);
  const month = monthParam < monthOf(todayISO) ? monthOf(todayISO) : monthParam > monthOf(lastBookable) ? monthOf(lastBookable) : monthParam;
  const dateParam = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : null;
  const timeParam = typeof sp.time === "string" && /^\d{2}:\d{2}$/.test(sp.time) ? sp.time : null;

  const monthStart = `${month}-01`;
  const monthEnd = lastDayOfMonth(month);
  const input = modality
    ? await loadAvailabilityInput({ professionalId: p.id, fromISO: monthStart, toISO: monthEnd, durationMinutes: service.durationMinutes })
    : null;
  const availableDays = input ? new Set(computeAvailableDays(input, monthStart, monthEnd)) : new Set<string>();
  const slots = input && dateParam ? computeAvailableSlots(input, dateParam) : [];
  const slotLabels = slots.map((s) => slotLabel(s, tz));
  const selectedTime = timeParam && slotLabels.includes(timeParam) ? timeParam : null;

  // Grade do mês começa na segunda
  const gridStart = addDaysCivil(monthStart, -((weekdayOfCivilDate(monthStart) + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => addDaysCivil(gridStart, i));
  const [y, m] = month.split("-").map(Number);
  const waitlistHref = `/agendar/${slug}/espera?serviceId=${service.id}`;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <Link href={`/agendar/${slug}`} className="text-sm text-text-muted hover:text-primary">
        ← {p.displayName}
      </Link>

      <header className="card mt-3 p-4">
        <p className="font-medium">{service.name}</p>
        {service.description && <p className="mt-1 text-sm text-text-muted">{service.description}</p>}
        <p className="mt-2 text-xs text-text-muted">
          {service.durationMinutes} min
          {p.showPrices && <> · {formatBRL(service.priceCents)}</>}
        </p>
      </header>

      {/* Passo 1 — modalidade */}
      {service.modality === "HYBRID" && (
        <section className="mt-6">
          <Step n={1} title="Como prefere ser atendido(a)?" done={modality ? MODALITY_LABEL[modality] : undefined} />
          <div className="grid grid-cols-2 gap-2">
            {(["IN_PERSON", "ONLINE"] as const).map((mod) => (
              <Link
                key={mod}
                href={withQuery({ modality: mod })}
                className={`rounded-lg border px-3 py-3 text-center text-sm transition ${modality === mod ? "border-primary bg-primary-soft font-medium text-primary" : "border-border bg-surface hover:border-primary/50"}`}
              >
                {MODALITY_LABEL[mod]}
                {mod === "IN_PERSON" && p.addressCity && <span className="block text-xs font-normal text-text-muted">{p.addressCity}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Passo 2 — data */}
      {modality && (
        <section className="mt-6">
          <Step n={service.modality === "HYBRID" ? 2 : 1} title="Escolha o dia" done={dateParam ? dateParam.split("-").reverse().join("/") : undefined} />
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <Link
                href={withQuery({ modality: modalityParam ?? undefined, month: addMonths(month, -1) })}
                aria-disabled={month <= monthOf(todayISO)}
                className={`rounded-md px-2 py-1 text-sm ${month <= monthOf(todayISO) ? "pointer-events-none text-text-muted/40" : "hover:bg-surface-muted"}`}
              >
                ←
              </Link>
              <p className="text-sm font-medium capitalize">
                {MONTHS[m - 1]} {y}
              </p>
              <Link
                href={withQuery({ modality: modalityParam ?? undefined, month: addMonths(month, 1) })}
                aria-disabled={month >= monthOf(lastBookable)}
                className={`rounded-md px-2 py-1 text-sm ${month >= monthOf(lastBookable) ? "pointer-events-none text-text-muted/40" : "hover:bg-surface-muted"}`}
              >
                →
              </Link>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-xs text-text-muted">
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <div key={wd} className="py-1">
                  {WEEKDAY_SHORT[wd]}
                </div>
              ))}
              {cells.map((d) => {
                const inMonth = d.startsWith(month);
                const ok = inMonth && availableDays.has(d);
                const selected = d === dateParam;
                if (!inMonth) return <div key={d} />;
                return ok ? (
                  <Link
                    key={d}
                    href={withQuery({ modality: modalityParam ?? undefined, month, date: d })}
                    className={`rounded-md py-2 text-sm transition ${selected ? "bg-primary font-semibold text-white" : "bg-primary-soft font-medium text-primary hover:bg-primary/20"}`}
                  >
                    {Number(d.slice(8))}
                  </Link>
                ) : (
                  <div key={d} className="py-2 text-sm text-text-muted/40">
                    {Number(d.slice(8))}
                  </div>
                );
              })}
            </div>
            {availableDays.size === 0 && (
              <p className="mt-3 text-center text-xs text-text-muted">
                Nenhum horário disponível neste mês.{" "}
                <Link href={waitlistHref} className="font-medium text-primary hover:underline">
                  Entrar na lista de espera
                </Link>
              </p>
            )}
          </div>
        </section>
      )}

      {/* Passo 3 — horário */}
      {modality && dateParam && (
        <section className="mt-6">
          <Step n={service.modality === "HYBRID" ? 3 : 2} title="Escolha o horário" done={selectedTime ?? undefined} />
          {slotLabels.length === 0 ? (
            <p className="text-sm text-text-muted">
              Sem horários neste dia. Escolha outra data ou{" "}
              <Link href={waitlistHref} className="font-medium text-primary hover:underline">
                entre na lista de espera
              </Link>
              .
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slotLabels.map((t) => (
                <Link
                  key={t}
                  href={withQuery({ modality: modalityParam ?? undefined, month, date: dateParam, time: t })}
                  className={`rounded-lg border py-2 text-center text-sm transition ${selectedTime === t ? "border-primary bg-primary font-semibold text-white" : "border-border bg-surface hover:border-primary/50"}`}
                >
                  {t}
                </Link>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-text-muted">Horários no fuso {tz.replace("_", " ")}.</p>
        </section>
      )}

      {!(modality && dateParam && selectedTime) && (
        <p className="mt-8 text-center text-xs text-text-muted">
          Nenhum horário serve?{" "}
          <Link href={waitlistHref} className="text-primary hover:underline">
            Entre na lista de espera
          </Link>
          .
        </p>
      )}

      {/* Passo 4 — dados */}
      {modality && dateParam && selectedTime && (
        <section className="mt-6">
          <Step n={service.modality === "HYBRID" ? 4 : 3} title="Seus dados" />
          <BookingForm
            slug={slug}
            serviceId={service.id}
            modality={modality}
            date={dateParam}
            time={selectedTime}
            cancellationPolicy={p.policy?.cancellationPolicy ?? null}
            patientInstructions={service.patientInstructions}
          />
        </section>
      )}
    </main>
  );
}
