import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { describeRule } from "@/lib/commissions/rules";
import { statement } from "@/lib/commissions/service";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canManageCommissions, canViewCommissions } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dateTimeInTz, formatDateBR, formatDateTimeBR, todayCivilAndMonth } from "@/lib/time";
import { AdjustmentForm, CloseForm } from "./forms";

export const metadata: Metadata = { title: "Comissões" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const KIND_LABEL = { PAYMENT: "Pagamento", REVERSAL: "Estorno", ADJUSTMENT: "Ajuste" } as const;

/** Extrato de comissões por profissional e mês (§25). Dono e Financeiro veem todos; profissional só o próprio. */
export default async function CommissionsPage({ searchParams }: PageProps<"/financeiro/comissoes">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const { month: currentMonth } = todayCivilAndMonth(new Date(), tz);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth;
  const [y, m] = month.split("-").map(Number);

  const professionals = await db.professional.findMany({ where: { organizationId: actor.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true } });
  const visible = professionals.filter((p) => canViewCommissions(actor, p.id));
  if (visible.length === 0) {
    return (
      <>
        <PageHeader title="Comissões" />
        <EmptyState title="Sem acesso a comissões" description="Recepção não vê valores. Profissionais veem só as próprias comissões." />
      </>
    );
  }
  const selected = visible.find((p) => p.id === sp.professional) ?? visible.find((p) => p.id === actor.activeProfessionalId) ?? visible[0];
  const from = dateTimeInTz(`${month}-01`, "00:00", tz);
  const to = dateTimeInTz(`${addMonths(month, 1)}-01`, "00:00", tz);
  const st = await statement(actor, selected.id, { from, to });
  const monthTotal = st.entries.reduce((s, e) => s + e.amountCents, 0);
  const canManage = canManageCommissions(actor);
  const link = (q: Record<string, string>) => `/financeiro/comissoes?${new URLSearchParams({ month, professional: selected.id, ...q }).toString()}`;
  const services = canManage ? await db.service.findMany({ where: { professionalId: selected.id }, select: { id: true, name: true } }) : [];
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Comissões"
        description="Calculadas sobre o valor recebido (sessões e pacotes), pela regra vigente na data do pagamento. Fechamentos são definitivos."
        actions={
          <div className="flex gap-2">
            <Link href="/financeiro" className="btn-ghost">
              ← Financeiro
            </Link>
            {canManage && (
              <Link href="/configuracoes/comissoes" className="btn-ghost">
                Regras
              </Link>
            )}
            <a href={`/financeiro/comissoes/export?month=${month}&professional=${selected.id}`} className="btn-ghost">
              CSV
            </a>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ month: addMonths(month, -1) })} className="btn-ghost px-2" aria-label="Mês anterior">
          ←
        </Link>
        <Link href={link({ month: currentMonth })} className="btn-ghost">
          Mês atual
        </Link>
        <Link href={link({ month: addMonths(month, 1) })} className="btn-ghost px-2" aria-label="Próximo mês">
          →
        </Link>
        <h2 className="ml-2 text-base font-medium">
          {MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)} de {y}
        </h2>
        {visible.length > 1 && (
          <div className="ml-auto flex flex-wrap gap-1">
            {visible.map((p) => (
              <Link key={p.id} href={link({ professional: p.id })} className={`rounded-md px-3 py-1.5 text-sm ${p.id === selected.id ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:text-text"}`}>
                {p.displayName}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">No mês</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(monthTotal)}</p>
          <p className="text-xs text-text-muted">{st.entries.length} lançamento(s)</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">Em aberto (a fechar)</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${st.openTotalCents > 0 ? "text-warning" : ""}`}>{formatBRL(st.openTotalCents)}</p>
          <p className="text-xs text-text-muted">{st.openCount} lançamento(s) sem fechamento</p>
        </div>
        <div className="card lg:col-span-2">
          <p className="text-xs uppercase tracking-wide text-text-muted">Regras vigentes</p>
          {st.rules.filter((r) => !r.validTo || r.validTo >= new Date()).length === 0 ? (
            <p className="mt-1 text-sm text-text-muted">Nenhuma regra: nada é lançado para {selected.displayName}.</p>
          ) : (
            <ul className="mt-1 text-sm">
              {st.rules
                .filter((r) => !r.validTo || r.validTo >= new Date())
                .map((r) => (
                  <li key={r.id}>
                    {r.serviceId ? (serviceName.get(r.serviceId) ?? "serviço") : "Geral"} · {describeRule(r)} · desde {formatDateBR(r.validFrom, "UTC")}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      <section className="card mt-6 p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Lançamentos</h2>
        </div>
        {st.entries.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">Nenhum lançamento neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Origem</th>
                  <th className="px-4 py-2 text-right">Base</th>
                  <th className="px-4 py-2 text-right">Comissão</th>
                  <th className="px-4 py-2">Fechamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {st.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatDateTimeBR(e.occurredAt, tz)}</td>
                    <td className="px-4 py-2">
                      {KIND_LABEL[e.kind]}
                      {e.appointmentId && (
                        <Link href={`/agenda/${e.appointmentId}`} className="ml-1 text-primary hover:underline">
                          sessão
                        </Link>
                      )}
                      {e.packagePurchaseId && <span className="ml-1 text-text-muted">pacote</span>}
                      {e.note && <span className="block text-xs text-text-muted">{e.note}</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-text-muted">{e.baseCents ? formatBRL(e.baseCents) : "—"}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${e.amountCents < 0 ? "text-danger" : ""}`}>{formatBRL(e.amountCents)}</td>
                    <td className="px-4 py-2 text-xs text-text-muted">{e.closing ? `fechado até ${formatDateBR(e.closing.periodEnd, "UTC")}` : "em aberto"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <CloseForm professionalId={selected.id} professionalName={selected.displayName} defaultStart={`${month}-01`} defaultEnd={`${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`} openTotal={formatBRL(st.openTotalCents)} />
          <AdjustmentForm professionalId={selected.id} professionalName={selected.displayName} />
        </div>
      )}

      {st.closings.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-2 text-base font-semibold">Fechamentos</h2>
          <ul className="divide-y divide-border text-sm">
            {st.closings.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span>
                  {formatDateBR(c.periodStart, "UTC")} – {formatDateBR(c.periodEnd, "UTC")} · {c.entriesCount} lançamento(s) · fechado em {formatDateTimeBR(c.closedAt, tz)}
                  {c.note && <span className="text-text-muted"> · {c.note}</span>}
                </span>
                <span className="font-medium tabular-nums">{formatBRL(c.totalCents)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
