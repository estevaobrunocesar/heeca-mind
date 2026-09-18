import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Início" };

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function DashboardPage() {
  const actor = await requireActor();
  const today = startOfToday();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const org = { organizationId: actor.organizationId };

  const [todayCount, nextSession, patientCount, confirmed, pending] = await Promise.all([
    db.appointment.count({
      where: { ...org, startsAt: { gte: today, lt: tomorrow }, status: { notIn: ["CANCELLED_BY_PATIENT", "CANCELLED_BY_PROFESSIONAL"] } },
    }),
    db.appointment.findFirst({
      where: { ...org, startsAt: { gte: new Date() }, status: { in: ["CONFIRMED", "PENDING", "AWAITING_CONFIRMATION"] } },
      orderBy: { startsAt: "asc" },
      include: { patient: { select: { name: true } } },
    }),
    db.patient.count({ where: { ...org, deletedAt: null } }),
    db.appointment.count({ where: { ...org, status: "CONFIRMED", startsAt: { gte: new Date() } } }),
    db.appointment.count({ where: { ...org, status: { in: ["PENDING", "AWAITING_CONFIRMATION"] } } }),
  ]);

  const stats = [
    { label: "Sessões hoje", value: todayCount },
    { label: "Pacientes", value: patientCount },
    { label: "Confirmadas (futuras)", value: confirmed },
    { label: "Pendentes", value: pending },
  ];

  return (
    <>
      <PageHeader title="Início" description="Resumo do seu dia." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <p className="text-xs uppercase tracking-wide text-text-muted">{s.label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="card mt-6">
        <p className="text-xs uppercase tracking-wide text-text-muted">Próxima sessão</p>
        {nextSession ? (
          <p className="mt-2 text-sm">
            <span className="font-medium">{nextSession.patient.name}</span> ·{" "}
            {nextSession.serviceNameSnapshot} ·{" "}
            {nextSession.startsAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        ) : (
          <p className="mt-2 text-sm text-text-muted">Nenhuma sessão agendada.</p>
        )}
      </div>
    </>
  );
}
