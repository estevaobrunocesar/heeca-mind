"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { addAdjustmentAction, closePeriodAction } from "./actions";

export function CloseForm({ professionalId, professionalName, defaultStart, defaultEnd, openTotal }: { professionalId: string; professionalName: string; defaultStart: string; defaultEnd: string; openTotal: string }) {
  const [state, action] = useActionState<FormState, FormData>(closePeriodAction, {});
  return (
    <form action={action} className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold">Fechar período</h2>
        <p className="mt-1 text-sm text-text-muted">
          Consolida tudo em aberto até a data final ({openTotal}) para {professionalName}. Definitivo: lançamentos posteriores entram no próximo fechamento; estornos viram linha negativa.
        </p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Período fechado." />}
      <input type="hidden" name="professionalId" value={professionalId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Início" name="periodStart" type="date" defaultValue={state.values?.periodStart ?? defaultStart} errors={state.fieldErrors?.periodStart} />
        <Field label="Fim" name="periodEnd" type="date" defaultValue={state.values?.periodEnd ?? defaultEnd} errors={state.fieldErrors?.periodEnd} />
      </div>
      <Field label="Observação" name="note" required={false} defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      <div className="w-40">
        <SubmitButton pendingText="Fechando…">Fechar período</SubmitButton>
      </div>
    </form>
  );
}

export function AdjustmentForm({ professionalId, professionalName }: { professionalId: string; professionalName: string }) {
  const [state, action] = useActionState<FormState, FormData>(addAdjustmentAction, {});
  return (
    <form action={action} className="card space-y-3">
      <div>
        <h2 className="text-base font-semibold">Ajuste manual</h2>
        <p className="mt-1 text-sm text-text-muted">Bônus ou desconto para {professionalName}. Use valor negativo para descontar (ex.: -50,00). Entra no período em aberto.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Ajuste lançado." />}
      <input type="hidden" name="professionalId" value={professionalId} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Valor (R$)" name="amount" inputMode="decimal" placeholder="100,00" defaultValue={state.values?.amount} errors={state.fieldErrors?.amount} />
        <Field label="Motivo" name="note" placeholder="Ex.: bônus por meta de setembro" defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      </div>
      <div className="w-40">
        <SubmitButton pendingText="Lançando…">Lançar ajuste</SubmitButton>
      </div>
    </form>
  );
}
