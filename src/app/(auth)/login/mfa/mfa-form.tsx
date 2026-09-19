"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { verifyMfaAction } from "./actions";

export function MfaForm() {
  const [state, action] = useActionState<FormState, FormData>(verifyMfaAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field
        label="Código"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="123 456 ou xxxxx-xxxxx"
        errors={state.fieldErrors?.code}
      />
      <SubmitButton pendingText="Verificando…">Confirmar</SubmitButton>
    </form>
  );
}
