import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { listDelegations, type DelegationView } from "@/lib/clinical";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { formatDateBR, todayCivilAndMonth } from "@/lib/time";
import { DelegationList, GrantForm } from "./delegation-panel";

export const metadata: Metadata = { title: "Delegações de prontuário" };

export default async function DelegationsPage() {
  const actor = await requireActor();
  if (!actor.professionalId || actor.role === "RECEPTIONIST") {
    return <EmptyState title="Só profissionais delegam prontuários" description="A delegação é um ato do psicólogo responsável sobre os próprios registros clínicos." />;
  }
  const pid = actor.professionalId;

  const [org, professionals, patients, { granted, received }] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
    db.professional.findMany({
      where: { organizationId: actor.organizationId, isActive: true, userId: { not: null }, id: { not: pid } },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, crp: true },
    }),
    // Só pacientes que o titular atende (mesma regra do prontuário).
    db.patient.findMany({
      where: { organizationId: actor.organizationId, deletedAt: null, anonymizedAt: null, appointments: { some: { professionalId: pid, status: { notIn: ["CANCELLED_BY_PATIENT", "CANCELLED_BY_PROFESSIONAL", "EXPIRED"] } } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listDelegations(actor),
  ]);
  const tz = org.timezone;
  const row = (d: DelegationView) => ({
    id: d.id,
    kind: d.kind,
    reason: d.reason,
    startsAt: formatDateBR(d.startsAt, tz),
    expiresAt: formatDateBR(d.expiresAt, tz),
    revokedAt: d.revokedAt ? formatDateBR(d.revokedAt, tz) : null,
    active: d.active,
    patientName: d.patient?.name ?? null,
    grantorName: d.grantor.displayName,
    delegateName: d.delegate.displayName,
  });

  return (
    <div className="max-w-3xl space-y-6">
      {professionals.length === 0 ? (
        <section className="card">
          <h2 className="text-base font-semibold">Delegar acesso ao prontuário</h2>
          <p className="mt-1 text-sm text-text-muted">Não há outro profissional com login nesta organização. Convide um colega em Equipe para poder delegar.</p>
        </section>
      ) : (
        <GrantForm
          professionals={professionals.map((p) => ({ value: p.id, label: `${p.displayName} · CRP ${p.crp}` }))}
          patients={patients.map((p) => ({ value: p.id, label: p.name }))}
          today={todayCivilAndMonth(new Date(), tz).date}
        />
      )}
      <section className="card">
        <h2 className="text-base font-semibold">Concedidas por você</h2>
        <div className="mt-2">
          <DelegationList rows={granted.map(row)} mine />
        </div>
      </section>
      <section className="card">
        <h2 className="text-base font-semibold">Recebidas</h2>
        <p className="mt-1 text-xs text-text-muted">Prontuários de colegas aos quais você tem acesso. Abra pela ficha do paciente.</p>
        <div className="mt-2">
          <DelegationList rows={received.map(row)} mine={false} />
        </div>
      </section>
    </div>
  );
}
