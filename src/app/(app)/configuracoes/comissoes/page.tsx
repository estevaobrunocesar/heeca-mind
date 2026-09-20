import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { describeRule } from "@/lib/commissions/rules";
import { db } from "@/lib/db";
import { canManageCommissions } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { formatDateBR } from "@/lib/time";
import { RuleForm, RuleRowActions } from "./rule-form";

export const metadata: Metadata = { title: "Comissões" };

/** Regras de comissão por profissional (§25). Só dono/financeiro. Regras não se apagam: encerram a vigência. */
export default async function CommissionRulesPage() {
  const actor = await requireActor();
  if (!canManageCommissions(actor)) return <EmptyState title="Só o responsável ou o financeiro definem comissões" description="Profissionais veem o próprio extrato em Financeiro → Comissões." />;
  const [professionals, rules] = await Promise.all([
    db.professional.findMany({ where: { organizationId: actor.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, displayName: true, services: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } } } }),
    db.commissionRule.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ professionalId: "asc" }, { validFrom: "desc" }] }),
  ]);
  const proName = new Map(professionals.map((p) => [p.id, p.displayName]));
  const svcName = new Map(professionals.flatMap((p) => p.services.map((s) => [s.id, s.name] as const)));
  const today = new Date();
  return (
    <div className="max-w-4xl space-y-6">
      <p className="text-sm text-text-muted">
        A comissão incide sobre o <strong>valor recebido</strong> (sessões e pacotes), pela regra vigente na data do pagamento. Regra de um serviço específico prevalece sobre a geral. Valor fixo é por sessão (em pacotes, proporcional ao que foi pago).
      </p>
      <RuleForm professionals={professionals} />
      <section className="card p-0">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-base font-semibold">Regras</h2>
        </div>
        {rules.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">Nenhuma regra. Sem regra, nada é lançado — o extrato fica vazio.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rules.map((r) => {
              const active = !r.validTo || r.validTo >= today;
              return (
                <li key={r.id} className={`flex items-center justify-between gap-3 px-4 py-2 ${active ? "" : "opacity-60"}`}>
                  <span>
                    <strong>{proName.get(r.professionalId) ?? "—"}</strong> · {r.serviceId ? (svcName.get(r.serviceId) ?? "serviço") : "Geral"} · {describeRule(r)} · de {formatDateBR(r.validFrom, "UTC")}
                    {r.validTo && ` até ${formatDateBR(r.validTo, "UTC")}`}
                    {r.note && <span className="text-text-muted"> · {r.note}</span>}
                  </span>
                  {active && <RuleRowActions ruleId={r.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
