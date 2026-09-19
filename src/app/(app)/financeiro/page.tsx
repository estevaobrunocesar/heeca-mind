import type { Metadata } from "next";
import Link from "next/link";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { STATUS_LABEL } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canViewFinancials } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dateTimeInTz, formatDateTimeBR, todayCivilAndMonth } from "@/lib/time";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { QuickPay } from "./quick-pay";

export const metadata: Metadata = { title: "Financeiro" };

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Sessões que contam como receita: realizadas ou ainda por acontecer (confirmadas). */
const REVENUE_STATUSES = ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT"] as const;

export default async function FinancePage({ searchParams }: PageProps<"/financeiro">) {
  const sp = await searchParams;
  const actor = await requireActor();
  if (!actor.activeProfessionalId || !canViewFinancials(actor, actor.activeProfessionalId)) {
    return <EmptyState title="Sem acesso ao financeiro" description="Apenas o profissional ou o responsável pela clínica veem valores." />;
  }

  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const { month: currentMonth } = todayCivilAndMonth(new Date(), tz);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : currentMonth;
  const [y, m] = month.split("-").map(Number);
  const start = dateTimeInTz(`${month}-01`, "00:00", tz);
  const end = dateTimeInTz(`${addMonths(month, 1)}-01`, "00:00", tz);

  const proFilter = actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId };

  const [sessions, receivedInMonth] = await Promise.all([
    db.appointment.findMany({
      where: { ...proFilter, startsAt: { gte: start, lt: end }, status: { in: [...REVENUE_STATUSES, "NO_SHOW"] } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        status: true,
        modality: true,
        serviceNameSnapshot: true,
        priceCents: true,
        paymentStatus: true,
        paymentMethod: true,
        patient: { select: { name: true, preferredPaymentMethod: true, needsReceipt: true } },
      },
    }),
    // Caixa: o que efetivamente entrou no mês, independente de quando foi a sessão.
    db.payment.groupBy({
      by: ["method"],
      where: { appointment: proFilter, paidAt: { gte: start, lt: end } },
      _sum: { amountCents: true },
    }),
  ]);

  const realized = sessions.filter((s) => s.status === "COMPLETED");
  // Confirmadas do mês, passadas ou não: uma sessão confirmada que já
  // aconteceu e não foi marcada como concluída ainda conta como prevista.
  const upcoming = sessions.filter((s) => s.status === "CONFIRMED" || s.status === "AWAITING_PAYMENT");
  const sum = (xs: { priceCents: number }[]) => xs.reduce((a, s) => a + s.priceCents, 0);

  const realizedTotal = sum(realized.filter((s) => s.paymentStatus !== "WAIVED"));
  const receivedTotal = receivedInMonth.reduce((a, g) => a + (g._sum.amountCents ?? 0), 0);
  const pending = sessions.filter((s) => s.status === "COMPLETED" && s.paymentStatus === "PENDING");
  const pendingTotal = sum(pending);
  const forecast = realizedTotal + sum(upcoming);
  const noShowLost = sum(sessions.filter((s) => s.status === "NO_SHOW" && s.paymentStatus !== "PAID"));

  const monthLink = (ym: string) => `/financeiro?month=${ym}`;

  return (
    <>
      <PageHeader
        title="Financeiro"
        description="Controle simples: o que foi realizado, o que entrou e o que falta receber. Sem emissão fiscal."
        actions={
          <a href={`/financeiro/export?month=${month}`} className="btn-ghost">
            Exportar CSV
          </a>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Link href={monthLink(addMonths(month, -1))} className="btn-ghost px-2" aria-label="Mês anterior">
          ←
        </Link>
        <Link href={monthLink(currentMonth)} className="btn-ghost">
          Mês atual
        </Link>
        <Link href={monthLink(addMonths(month, 1))} className="btn-ghost px-2" aria-label="Próximo mês">
          →
        </Link>
        <h2 className="ml-2 text-base font-medium">
          {MONTHS[m - 1].charAt(0).toUpperCase() + MONTHS[m - 1].slice(1)} de {y}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">Realizado</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(realizedTotal)}</p>
          <p className="text-xs text-text-muted">{realized.length} sessão(ões) concluída(s)</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">Recebido no mês</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-success">{formatBRL(receivedTotal)}</p>
          <p className="text-xs text-text-muted">
            {receivedInMonth.length > 0
              ? receivedInMonth.map((g) => `${PAYMENT_METHOD_LABEL[g.method]} ${formatBRL(g._sum.amountCents ?? 0)}`).join(" · ")
              : "nenhum pagamento"}
          </p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">A receber</p>
          <p className={`mt-1 text-2xl font-semibold tabular-nums ${pendingTotal > 0 ? "text-warning" : ""}`}>{formatBRL(pendingTotal)}</p>
          <p className="text-xs text-text-muted">{pending.length} sessão(ões) concluída(s) sem pagamento</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-text-muted">Previsto no mês</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(forecast)}</p>
          <p className="text-xs text-text-muted">
            realizado + {upcoming.length} confirmada(s){noShowLost > 0 ? ` · ${formatBRL(noShowLost)} em faltas` : ""}
          </p>
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Sessões do mês</h2>
        {sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão neste mês" description="Sessões confirmadas, concluídas e faltas aparecem aqui." />
        ) : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2">Paciente</th>
                  <th className="px-4 py-2">Sessão</th>
                  <th className="px-4 py-2 text-right">Valor</th>
                  <th className="px-4 py-2">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sessions.map((s) => (
                  <tr key={s.id} className={s.status === "NO_SHOW" ? "opacity-70" : ""}>
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link href={`/agenda/${s.id}`} className="hover:text-primary hover:underline">
                        {formatDateTimeBR(s.startsAt, tz)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {s.patient.name}
                      {s.patient.needsReceipt && <span className="ml-1 text-[10px] uppercase text-warning">recibo</span>}
                    </td>
                    <td className="px-4 py-2 text-text-muted">
                      {s.serviceNameSnapshot}
                      <span className="block text-xs">{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBRL(s.priceCents)}</td>
                    <td className="px-4 py-2">
                      {s.paymentStatus === "PAID" ? (
                        <span className="text-xs text-success">Pago{s.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[s.paymentMethod]}` : ""}</span>
                      ) : s.paymentStatus === "WAIVED" ? (
                        <span className="text-xs text-text-muted">Isento</span>
                      ) : s.status === "COMPLETED" || s.status === "NO_SHOW" ? (
                        <QuickPay appointmentId={s.id} defaultMethod={(s.patient.preferredPaymentMethod ?? "PIX") as PaymentMethod} />
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
