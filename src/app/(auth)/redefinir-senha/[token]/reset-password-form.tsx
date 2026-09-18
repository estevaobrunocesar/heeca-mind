"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { resetPasswordAction, type FormState } from "../../actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <Field
        label="Nova senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres."
        errors={state.fieldErrors?.password}
      />
      <SubmitButton pendingText="Salvando…">Redefinir senha</SubmitButton>
    </form>
  );
}
