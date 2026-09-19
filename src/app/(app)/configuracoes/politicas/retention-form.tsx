"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { updateRetentionAction } from "../actions";

export function RetentionForm({ retentionYears, canEdit }: { retentionYears: number; canEdit: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(updateRetentionAction, {});
  return (
    <form action={action} className="card max-w-3xl space-y-4">
      <div>
        <h2 className="text-base font-semibold">Retenção e anonimização de dados (LGPD)</h2>
        <p className="mt-1 text-sm text-text-muted">
          Cadastros excluídos são anonimizados automaticamente após o prazo, contado a partir do último atendimento ou da
          exclusão (o que for mais tarde). A anonimização é irreversível: nome, contato, observações e notas clínicas são
          removidos; sessões, valores e datas ficam sem titular identificável.
        </p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Prazo salvo." />}
      <div className="max-w-xs">
        <Field
          label="Prazo de guarda (anos)"
          name="retentionYears"
          type="number"
          inputMode="numeric"
          defaultValue={state.values?.retentionYears ?? String(retentionYears)}
          errors={state.fieldErrors?.retentionYears}
          hint="Mínimo de 5 anos (Resolução CFP 001/2009)."
        />
      </div>
      {canEdit ? (
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">Salvar prazo</SubmitButton>
        </div>
      ) : (
        <p className="text-xs text-text-muted">Apenas o responsável pela organização pode alterar.</p>
      )}
    </form>
  );
}
