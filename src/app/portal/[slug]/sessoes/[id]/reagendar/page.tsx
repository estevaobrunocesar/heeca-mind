import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getPortalActor, patientCanChange, professionalBySlug, rescheduleOptions } from "@/lib/portal/service";
import { formatDateBR, formatDateTimeBR, slotLabelInTz } from "@/lib/time";
import { PickSlot } from "./pick-slot";

export const metadata: Metadata = { title: "Reagendar" };

/** Mesma disponibilidade da página pública (grade + buffer + antecedência), excluindo a própria sessão. */
export default async function PortalReschedulePage({ params, searchParams }: PageProps<"/portal/[slug]/sessoes/[id]/reagendar">) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const pro = await professionalBySlug(slug);
  if (!pro) notFound();
  const actor = await getPortalActor(pro.organizationId);
  if (!actor) redirect(`/portal/${slug}?expired=1`);
  const opts = await rescheduleOptions(actor, id, typeof sp.date === "string" ? sp.date : undefined);
  if (!opts) notFound();
  const { appointment: a, tz, days, day, slots } = opts;
  const check = patientCanChange(a, a.professional.scheduleSettings?.minRescheduleHours ?? 24);
  if (!check.ok) redirect(`/portal/${slug}/sessoes/${id}`);
  const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const weekday = (iso: string) => WD[new Date(`${iso}T12:00:00Z`).getUTCDay()];

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <Link href={`/portal/${slug}/sessoes/${id}`} className="text-sm text-text-muted hover:text-text">
          ← Sessão
        </Link>
        <h1 className="mt-1 text-2xl font-normal text-primary">Escolher outro horário</h1>
        <p className="text-sm text-text-muted">
          Hoje: {formatDateTimeBR(a.startsAt, tz)} · {a.serviceNameSnapshot} · {a.durationMinutes} min
        </p>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-text-muted">Sem horários livres nos próximos 30 dias. Fale com o profissional.</p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium">Dia</h2>
            <div className="flex flex-wrap gap-2">
              {days.map((d) => (
                <Link key={d} href={`/portal/${slug}/sessoes/${id}/reagendar?date=${d}`} className={`rounded-md border px-3 py-1.5 text-sm ${d === day ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary/50"}`}>
                  {weekday(d)} {formatDateBR(new Date(`${d}T12:00:00Z`), "UTC").slice(0, 5)}
                </Link>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium">Horário</h2>
            <PickSlot slug={slug} appointmentId={id} slots={slots.map((s) => ({ iso: s.toISOString(), label: slotLabelInTz(s, tz) }))} />
          </section>
        </>
      )}
    </div>
  );
}
