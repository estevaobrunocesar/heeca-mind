import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR, WEEKDAY_SHORT } from "@/lib/time";
import { BlockForm, DeleteButton, ExceptionForm } from "./block-forms";

export const metadata: Metadata = { title: "Bloqueios" };

const TYPE_LABEL = { BLOCK: "Bloqueio", DAY_OFF: "Folga", VACATION: "Férias" } as const;

/** Data civil (@db.Date, meia-noite UTC) -> "sáb, 03/10/2026" sem conversão de fuso. */
function formatCivilDate(d: Date) {
  const wd = WEEKDAY_SHORT[d.getUTCDay()].toLowerCase();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${wd}, ${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Mostra também o que terminou nas últimas 24h, para o profissional ver o que acabou de passar. */
function yesterday() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}

export default async function BlocksPage() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) {
    return <EmptyState title="Nenhum perfil profissional vinculado" description="Sua conta não possui um perfil de psicólogo." />;
  }
  if (!canEditProfessional(actor, actor.activeProfessionalId)) {
    return <EmptyState title="Sem permissão" description="Recepção não altera perfil, horários ou políticas dos profissionais." />;
  }
  const professionalId = actor.activeProfessionalId;
  const since = yesterday();

  const [org, blocks, exceptions] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } }),
    db.scheduleBlock.findMany({
      where: { professionalId, endsAt: { gte: since } },
      orderBy: { startsAt: "asc" },
    }),
    db.scheduleException.findMany({
      where: { professionalId, date: { gte: since } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ]);
  const tz = org.timezone;

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <BlockForm />
        <section className="card">
          <h2 className="text-base font-semibold">Próximos bloqueios</h2>
          {blocks.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">Nenhum bloqueio futuro.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {TYPE_LABEL[b.type]}
                      {b.reason && <span className="font-normal text-text-muted"> · {b.reason}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {formatDateTimeBR(b.startsAt, tz)} até {formatDateTimeBR(b.endsAt, tz)}
                    </p>
                  </div>
                  <DeleteButton kind="block" id={b.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <ExceptionForm />
        <section className="card">
          <h2 className="text-base font-semibold">Próximos horários excepcionais</h2>
          {exceptions.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">Nenhum horário excepcional futuro.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {exceptions.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {formatCivilDate(e.date)} · {e.startTime}–{e.endTime}
                    </p>
                    {e.note && <p className="mt-0.5 text-xs text-text-muted">{e.note}</p>}
                  </div>
                  <DeleteButton kind="exception" id={e.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
