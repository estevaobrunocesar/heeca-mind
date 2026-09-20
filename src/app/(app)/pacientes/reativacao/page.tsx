import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { canManageSchedule } from "@/lib/permissions";
import { DEFAULT_REACTIVATION_TEXT } from "@/lib/reports/rules";
import { listReactivation } from "@/lib/reports/service";
import { requireActor } from "@/lib/session";
import { formatDateBR } from "@/lib/time";
import { ReactivationRow } from "./row";

export const metadata: Metadata = { title: "Reativação" };

/** §28: quem está parado há N dias. Nada é enviado sozinho — cada convite é um clique, registrado. */
export default async function ReactivationPage({ searchParams }: PageProps<"/pacientes/reativacao">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const professionalId = (typeof sp.professional === "string" ? sp.professional : null) ?? actor.activeProfessionalId;
  if (!professionalId || !canManageSchedule(actor, professionalId)) return <EmptyState title="Sem acesso" description="Escolha um profissional no seletor do cabeçalho." />;
  const pro = await db.professional.findFirst({ where: { id: professionalId, organizationId: actor.organizationId }, select: { displayName: true, organization: { select: { timezone: true } } } });
  if (!pro) return <EmptyState title="Profissional não encontrado" description="Escolha outro no seletor do cabeçalho." />;
  const tz = pro.organization.timezone;
  const { afterDays, inviteText, candidates } = await listReactivation(actor, professionalId);
  return (
    <>
      <PageHeader
        title="Reativação"
        description={`Pacientes em acompanhamento com ${pro.displayName} sem sessão concluída há ${afterDays}+ dias, sem sessão futura e sem convite recente.`}
        actions={
          <Link href="/pacientes" className="btn-ghost">
            ← Pacientes
          </Link>
        }
      />
      <div className="card mb-4 text-sm">
        <p className="text-xs uppercase tracking-wide text-text-muted">Mensagem que será enviada (WhatsApp)</p>
        <p className="mt-1">
          “Oi, <em>[nome]</em>! Aqui é {pro.displayName}. <strong>{inviteText ?? DEFAULT_REACTIVATION_TEXT}</strong> Quer reservar seu próximo horário? É só tocar no botão.” + botão <em>Agendar</em>.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Texto e prazo em{" "}
          <Link href="/configuracoes/politicas" className="text-primary hover:underline">
            Configurações → Políticas
          </Link>
          . Estritamente administrativo.
        </p>
      </div>
      {candidates.length === 0 ? (
        <EmptyState title="Ninguém para reativar agora" description="Todo mundo em acompanhamento teve sessão recente, tem sessão marcada ou já recebeu convite." />
      ) : (
        <section className="card p-0">
          <ul className="divide-y divide-border">
            {candidates.map((c) => (
              <ReactivationRow key={c.id} professionalId={professionalId} patientId={c.id} name={c.name} last={c.lastCompletedAt ? formatDateBR(c.lastCompletedAt, tz) : `cadastro em ${formatDateBR(c.createdAt, tz)}`} lastContact={c.lastContactAt ? formatDateBR(c.lastContactAt, tz) : null} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
