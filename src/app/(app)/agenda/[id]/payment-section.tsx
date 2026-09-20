"use client";

import { useActionState, useState, useTransition } from "react";
import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import { Field, FormError, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { centsToInput, formatBRL } from "@/lib/money";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { registerPaymentAction, revertPaymentAction, waivePaymentAction } from "../../financeiro/actions";

type Payment = { id: string; amountCents: number; method: PaymentMethod; paidAt: string; note: string | null };

const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABEL).map(([value, label]) => ({ value, label }));

export function PaymentSection({
  appointmentId,
  priceCents,
  paymentStatus,
  payments,
  preferredMethod,
  needsReceipt,
}: {
  appointmentId: string;
  priceCents: number;
  paymentStatus: PaymentStatus;
  payments: Payment[];
  preferredMethod: PaymentMethod | null;
  needsReceipt: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [state, action] = useActionState<FormState, FormData>(registerPaymentAction.bind(null, appointmentId), {});
  const paid = payments.reduce((s, p) => s + p.amountCents, 0);
  const remaining = Math.max(0, priceCents - paid);

  const badge =
    paymentStatus === "PAID"
      ? "bg-primary-soft text-primary"
      : paymentStatus === "WAIVED"
        ? "bg-surface-muted text-text-muted"
        : "bg-warning/15 text-warning";
  const label = paymentStatus === "PAID" ? "Pago" : paymentStatus === "WAIVED" ? "Isento" : paymentStatus === "PACKAGE" ? "Pacote" : paid > 0 ? "Parcial" : "Pendente";

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Pagamento</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge}`}>{label}</span>
      </div>

      <div className="flex items-baseline justify-between text-sm">
        <span className="text-text-muted">Valor da sessão</span>
        <span className="font-medium tabular-nums">{formatBRL(priceCents)}</span>
      </div>
      {paid > 0 && paymentStatus !== "WAIVED" && (
        <div className="mt-1 flex items-baseline justify-between text-sm">
          <span className="text-text-muted">Recebido</span>
          <span className="tabular-nums">{formatBRL(paid)}</span>
        </div>
      )}
      {needsReceipt && <p className="mt-2 text-xs text-warning">Paciente precisa de recibo.</p>}

      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-xs text-text-muted">
          {payments.map((p) => (
            <li key={p.id} className="flex justify-between py-1">
              <span>
                {new Date(p.paidAt).toLocaleDateString("pt-BR")} · {PAYMENT_METHOD_LABEL[p.method]}
                {p.note && <span> · {p.note}</span>}
              </span>
              <span className="tabular-nums">{formatBRL(p.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}

      {paymentStatus === "PENDING" && (
        <div className="mt-4 space-y-3">
          {!open ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
                Registrar pagamento
              </button>
              <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(() => waivePaymentAction(appointmentId))}>
                Isentar
              </button>
            </div>
          ) : (
            <form action={action} className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-4">
              <FormError message={state.error} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Forma" name="method" options={METHOD_OPTIONS} defaultValue={state.values?.method ?? preferredMethod ?? "PIX"} errors={state.fieldErrors?.method} />
                <Field label="Valor (R$)" name="amount" inputMode="decimal" required={false} placeholder={centsToInput(remaining)} hint="Vazio = restante." defaultValue={state.values?.amount} errors={state.fieldErrors?.amount} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data" name="paidAt" type="date" required={false} hint="Vazio = hoje." defaultValue={state.values?.paidAt} errors={state.fieldErrors?.paidAt} />
                <Field label="Observação" name="note" required={false} defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
              </div>
              <div className="flex gap-2">
                <div className="w-40">
                  <SubmitButton pendingText="Salvando…">Confirmar</SubmitButton>
                </div>
                <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {paymentStatus !== "PENDING" && (
        <button
          type="button"
          className="mt-4 text-xs text-text-muted hover:text-danger"
          disabled={pending}
          onClick={() => {
            if (!confirm("Desfazer o pagamento e voltar para pendente?")) return;
            start(() => revertPaymentAction(appointmentId));
          }}
        >
          Desfazer
        </button>
      )}
    </section>
  );
}
