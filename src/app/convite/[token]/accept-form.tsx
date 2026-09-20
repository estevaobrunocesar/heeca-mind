"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { acceptInviteAction } from "./actions";

export function AcceptForm({ token, isProfessional }: { token: string; isProfessional: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(acceptInviteAction, {});
  const fe = state.fieldErrors;
  const v = state.values;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormError message={state.error} />
      <Field label="Nome completo" name="fullName" autoComplete="name" defaultValue={v?.fullName} errors={fe?.fullName} />
      {isProfessional ? (
        <>
          <Field label="Nome profissional" name="displayName" placeholder="Ex.: Dr. Carlos" hint="Como aparecerá para os pacientes." defaultValue={v?.displayName} errors={fe?.displayName} />
          <Field label="CRP" name="registrationNumber" placeholder="06/123456" defaultValue={v?.registrationNumber} errors={fe?.registrationNumber} />
        </>
      ) : (
        <>
          <input type="hidden" name="displayName" value="" />
          <input type="hidden" name="registrationNumber" value="" />
        </>
      )}
      <Field label="Crie uma senha" name="password" type="password" autoComplete="new-password" hint="Mínimo de 8 caracteres." errors={fe?.password} />
      <SubmitButton pendingText="Entrando…">Aceitar e entrar</SubmitButton>
    </form>
  );
}
