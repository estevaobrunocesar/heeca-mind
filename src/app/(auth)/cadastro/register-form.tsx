"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import { registerAction, type FormState } from "../actions";

export function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});
  const fe = state.fieldErrors;
  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <Field label="Nome completo" name="fullName" autoComplete="name" errors={fe?.fullName} />
      <Field
        label="Nome profissional"
        name="displayName"
        placeholder="Ex.: Dra. Ana Lúcia"
        hint="Como aparecerá para os pacientes e no seu link de agendamento."
        errors={fe?.displayName}
      />
      <Field label="CRP" name="crp" placeholder="06/123456" errors={fe?.crp} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" errors={fe?.email} />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo de 8 caracteres."
        errors={fe?.password}
      />
      <SubmitButton pendingText="Criando conta…">Criar conta</SubmitButton>
      <p className="text-center text-xs text-text-muted">
        Ao criar a conta você concorda com os termos de uso e a política de privacidade.
      </p>
    </form>
  );
}
