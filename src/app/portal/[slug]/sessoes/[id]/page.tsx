import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { STATUS_LABEL } from "@/lib/appointment-status";
import { getPortalActor, patientCanChange, portalAppointment, professionalBySlug } from "@/lib/portal/service";
import { formatDateTimeBR } from "@/lib/time";
import { SessionActions } from "./session-actions";

export const metadata: Metadata = { title: "Sessão" };

export default async function PortalSessionPage({ params }: PageProps<"/portal/[slug]/sessoes/[id]">) {
  const { slug, id } = await params;
  const pro = await professionalBySlug(slug);
  if (!pro) notFound();
  const actor = await getPortalActor(pro.organizationId);
  if (!actor) redirect(`/portal/${slug}?expired=1`);
  const a = await portalAppointment(actor, id);
  if (!a) notFound();
  const tz = pro.organization.timezone;
  const cancel = patientCanChange(a, a.professional.scheduleSettings?.minCancelHours ?? 24);
  const resched = patientCanChange(a, a.professional.scheduleSettings?.minRescheduleHours ?? 24);
  const link = a.onlineLink ?? a.professional.onlineFixedLink;

  return (
    <div className="space-y-6">
      <div className="border-b border-border pb-4">
        <Link href={`/portal/${slug}`} className="text-sm text-text-muted hover:text-text">
          ← Início
        </Link>
        <h1 className="mt-1 text-2xl font-normal text-primary">{a.serviceNameSnapshot}</h1>
        <p className="text-sm text-text-muted">
          {formatDateTimeBR(a.startsAt, tz)} · {a.durationMinutes} min · {a.modality === "ONLINE" ? "Online" : "Presencial"} · {a.professional.displayName} · {STATUS_LABEL[a.status]}
        </p>
      </div>

      {a.modality === "ONLINE" && (
        <section className="card">
          <h2 className="text-base font-semibold">Sessão online</h2>
          {link ? (
            <a href={link} target="_blank" rel="noreferrer" className="btn-primary mt-2">
              Acessar sala ↗
            </a>
          ) : (
            <p className="mt-2 text-sm text-text-muted">O link será enviado por WhatsApp antes da sessão.</p>
          )}
          {a.professional.policy?.onlineInstructions && <p className="mt-3 whitespace-pre-wrap text-sm text-text-muted">{a.professional.policy.onlineInstructions}</p>}
        </section>
      )}

      <section className="card">
        <h2 className="text-base font-semibold">Reagendar ou cancelar</h2>
        {(a.professional.policy?.reschedulePolicy || a.professional.policy?.cancellationPolicy) && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-text-muted">{a.professional.policy?.reschedulePolicy ?? a.professional.policy?.cancellationPolicy}</p>
        )}
        <SessionActions slug={slug} appointmentId={a.id} canReschedule={resched.ok} canCancel={cancel.ok} blockedReason={!resched.ok ? resched.reason : !cancel.ok ? cancel.reason : undefined} />
      </section>
    </div>
  );
}
