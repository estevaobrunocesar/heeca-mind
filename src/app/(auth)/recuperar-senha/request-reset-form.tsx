"use client";

import { useActionState } from "react";
import { Field, FormSuccess, SubmitButton } from "@/components/ui/form";
import { requestPasswordResetAction, type FormState } from "../actions";

export function RequestResetForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordResetAction, {});
  if (state.ok) {
    return <FormSuccess message="Se o e-mail estiver cadastrado, você receberá o link em instantes." />;
  }
  return (
    <form action={action} className="space-y-4">
      <Field label="E-mail" name="email" type="email" autoComplete="email" errors={state.fieldErrors?.email} />
      <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
    </form>
  );
}
