import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { canManageSchedule } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { formatDateBR, formatDateTimeBR, todayCivilAndMonth } from "@/lib/time";
import { listWaitlist } from "@/lib/waitlist";
import { describePrefs } from "@/lib/waitlist-match";
import { AddForm, WaitlistTable, type WaitlistRow } from "./waitlist-panel";

export const metadata: Metadata = { title: "Lista de espera" };

export default async function WaitlistPage() {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId) {
    return (
      <>
        <PageHeader title="Lista de espera" />
        <EmptyState title="Escolha um profissional" description="Use o seletor do cabeçalho para ver a lista de espera de um profissional." />
      </>
    );
  }
  if (!canManageSchedule(actor, professionalId)) {
    return (
      <>
        <PageHeader title="Lista de espera" />
        <EmptyState title="Sem permissão" description="Você não gerencia a agenda deste profissional." />
      </>
    );
  }

  const [org, pro, entries, patients, services] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
    db.professional.findUniqueOrThrow({ where: { id: professionalId }, select: { displayName: true, slug: true } }),
    listWaitlist(professionalId),
    db.patient.findMany({ where: { organizationId: actor.organizationId, deletedAt: null, anonymizedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.service.findMany({ where: { professionalId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, modality: true } }),
  ]);
  const tz = org.timezone;
  const today = todayCivilAndMonth(new Date(), tz).date;

  const rows: WaitlistRow[] = entries.map((e) => ({
    id: e.id,
    status: e.status as "WAITING" | "OFFERED",
    patientId: e.patient.id,
    patientName: e.patient.name,
    whatsapp: e.patient.whatsapp,
    prefs: describePrefs({ modality: e.modality === "HYBRID" ? null : e.modality, weekdays: e.weekdays, periods: e.periods }),
    serviceName: e.service?.name ?? null,
    note: e.note,
    source: e.source,
    priority: e.priority,
    offersCount: e.offersCount,
    waitingSince: formatDateBR(e.createdAt, tz),
    offered: e.offeredAppointment ? { appointmentId: e.offeredAppointment.id, label: formatDateTimeBR(e.offeredAppointment.startsAt, tz) } : null,
    serviceModality: e.service ? (services.find((s) => s.id === e.service!.id)?.modality ?? null) : null,
  }));

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return (
    <>
      <PageHeader
        title={`Lista de espera · ${pro.displayName}`}
        description="Quem quer um horário que ainda não existe. Ofereça um horário quando vagar; a pessoa confirma pelo WhatsApp e o horário fica reservado até lá."
        actions={
          <div className="flex gap-2">
            <Link href="/agenda" className="btn-ghost">
              ← Agenda
            </Link>
          </div>
        }
      />
      <div className="max-w-4xl space-y-6">
        <AddForm patients={patients.map((p) => ({ value: p.id, label: p.name }))} services={services.map((s) => ({ value: s.id, label: s.name }))} />
        <WaitlistTable rows={rows} today={today} />
        <p className="text-xs text-text-muted">
          Pacientes também entram sozinhos pela página pública quando não encontram horário:{" "}
          <code className="rounded bg-surface-muted px-1">
            {base}/agendar/{pro.slug}/espera
          </code>
        </p>
      </div>
    </>
  );
}
