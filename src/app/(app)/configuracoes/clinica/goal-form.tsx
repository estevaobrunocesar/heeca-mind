"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/form";
import { updateGoalAction } from "./actions";

/** Meta de recebimento do mês — vira o anel de progresso do painel inicial. */
export function GoalForm({ metaMensal }: { metaMensal: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateGoalAction, {});
  return (
    <form action={action} className="card">
      <h2 className="card-title">Meta do mês</h2>
      <p className="mt-1 text-sm text-mut">Aparece como anel de progresso no painel inicial. Deixe em branco para não acompanhar.</p>
      <div className="mt-4">
        <label className="label" htmlFor="metaMensal">Meta de recebimento (R$)</label>
        <input id="metaMensal" name="metaMensal" inputMode="decimal" className="input max-w-xs" defaultValue={state.values?.metaMensal ?? metaMensal} placeholder="12.000,00" />
        {state.fieldErrors?.metaMensal && <p className="field-error">{state.fieldErrors.metaMensal[0]}</p>}
      </div>
      {state.error && <p className="field-error mt-2">{state.error}</p>}
      {state.ok && <p className="mt-2 text-xs text-emerald-700">Meta salva.</p>}
      <div className="mt-4"><button type="submit" className="btn-primary">Salvar meta</button></div>
    </form>
  );
}
