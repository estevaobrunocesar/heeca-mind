"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { Field, FormError, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatBRL } from "@/lib/money";
import { PURCHASE_STATUS_LABEL } from "@/lib/packages/rules";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { cancelPurchaseAction, quickPayPackageAction, revertPackagePaymentAction, sellPackageAction } from "../../../pacotes/actions";

export type PurchaseCard = {
  id: string;
  name: string;
  professional: string;
  total: number;
  balance: number;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  priceCents: number;
  paidCents: number;
  paymentStatus: "PENDING" | "PAID" | "WAIVED" | "PACKAGE";
};

export type CatalogItem = { id: string; name: string; sessionsCount: number; priceCents: number; validityDays: number };

const STATUS_BADGE: Record<PurchaseCard["status"], string> = {
  ACTIVE: "bg-primary-soft text-primary",
  EXHAUSTED: "bg-surface-muted text-text-muted",
  EXPIRED: "bg-warning/15 text-warning",
  CANCELLED: "bg-surface-muted text-text-muted",
};

function SellForm({ patientId, catalog, onDone }: { patientId: string; catalog: CatalogItem[]; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(sellPackageAction.bind(null, patientId), {});
  // Fecha o formulário depois do sucesso — efeito, não durante o render.
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-3">
      <FormError message={state.error} />
      <Select
        label="Pacote"
        name="packageId"
        options={catalog.map((k) => ({ value: k.id, label: `${k.name} · ${k.sessionsCount} sessões · ${formatBRL(k.priceCents)} · ${k.validityDays} dias` }))}
        defaultValue={state.values?.packageId ?? catalog[0]?.id}
        errors={state.fieldErrors?.packageId}
      />
      <Field label="Observação" name="note" required={false} defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      <div className="flex gap-2">
        <div className="w-32">
          <SubmitButton pendingText="Vendendo…">Vender</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function CancelForm({ purchaseId, onDone }: { purchaseId: string; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(cancelPurchaseAction.bind(null, purchaseId), {});
  // Fecha o formulário depois do sucesso — efeito, não durante o render.
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="mt-2 space-y-2">
      <FormError message={state.error} />
      <Field label="Motivo do cancelamento" name="reason" defaultValue={state.values?.reason} errors={state.fieldErrors?.reason} />
      <div className="flex gap-2">
        <div className="w-32">
          <SubmitButton pendingText="Cancelando…">Confirmar</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Voltar
        </button>
      </div>
    </form>
  );
}

function Purchase({ p, showMoney, canSell, tz }: { p: PurchaseCard; showMoney: boolean; canSell: boolean; tz: string }) {
  const [cancelling, setCancelling] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("PIX");
  const [pending, start] = useTransition();
  const used = p.total - p.balance;
  const expires = new Date(p.expiresAt).toLocaleDateString("pt-BR", { timeZone: tz });
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{p.name}</p>
          <p className="text-xs text-text-muted">
            {p.total} contratada{p.total === 1 ? "" : "s"} · {used} usada{used === 1 ? "" : "s"} · <strong className="text-text">{p.balance} disponíve{p.balance === 1 ? "l" : "is"}</strong>
            {" · "}
            {p.status === "EXPIRED" ? `venceu em ${expires}` : `vence em ${expires}`} · {p.professional}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[p.status]}`}>{PURCHASE_STATUS_LABEL[p.status]}</span>
      </div>
      {showMoney && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="tabular-nums">{formatBRL(p.priceCents)}</span>
          {p.paymentStatus === "PAID" ? (
            <>
              <span className="text-success">pago</span>
              <button type="button" className="text-text-muted hover:text-danger" disabled={pending} onClick={() => confirm("Desfazer o pagamento do pacote?") && start(() => revertPackagePaymentAction(p.id))}>
                desfazer
              </button>
            </>
          ) : p.status !== "CANCELLED" ? (
            <>
              <span className="text-warning">{p.paidCents > 0 ? `parcial (${formatBRL(p.paidCents)})` : "pendente"}</span>
              <select className="input h-7 w-auto py-0 text-xs" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label="Forma de pagamento">
                {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-ghost h-7 px-2 py-0 text-xs" disabled={pending} onClick={() => start(() => quickPayPackageAction(p.id, method))}>
                Marcar pago
              </button>
            </>
          ) : null}
        </div>
      )}
      {canSell && p.status === "ACTIVE" && !cancelling && (
        <button type="button" className="mt-1 text-xs text-text-muted hover:text-danger" onClick={() => setCancelling(true)}>
          Cancelar pacote
        </button>
      )}
      {cancelling && <CancelForm purchaseId={p.id} onDone={() => setCancelling(false)} />}
    </li>
  );
}

export function PackagesPanel({ patientId, purchases, catalog, canSell, showMoney, tz }: { patientId: string; purchases: PurchaseCard[]; catalog: CatalogItem[]; canSell: boolean; showMoney: boolean; tz: string }) {
  const [selling, setSelling] = useState(false);
  const active = purchases.filter((p) => p.status === "ACTIVE");
  const others = purchases.filter((p) => p.status !== "ACTIVE");
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">Pacotes</h2>
        {canSell && catalog.length > 0 && !selling && (
          <button type="button" className="btn-ghost h-8 px-3 py-0 text-xs" onClick={() => setSelling(true)}>
            Vender pacote
          </button>
        )}
      </div>
      {selling && <SellForm patientId={patientId} catalog={catalog} onDone={() => setSelling(false)} />}
      {purchases.length === 0 && !selling && (
        <p className="text-sm text-text-muted">{catalog.length === 0 ? "Cadastre pacotes em Pacotes para vender aqui." : "Nenhum pacote vendido a este paciente."}</p>
      )}
      {active.length > 0 && (
        <ul className="divide-y divide-border">
          {active.map((p) => (
            <Purchase key={p.id} p={p} showMoney={showMoney} canSell={canSell} tz={tz} />
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-text-muted">Anteriores ({others.length})</summary>
          <ul className="divide-y divide-border">
            {others.map((p) => (
              <Purchase key={p.id} p={p} showMoney={showMoney} canSell={canSell} tz={tz} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
