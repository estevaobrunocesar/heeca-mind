"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormError, SubmitButton } from "@/components/ui/form";
import { acceptDocumentAction, type AcceptState } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action] = useActionState<AcceptState, FormData>(acceptDocumentAction.bind(null, token), {});
  return (
    <form action={action} className="card space-y-4">
      <FormError message={state.error} />
      <Field label="Seu nome completo" name="name" autoComplete="name" placeholder="Como está no seu cadastro" defaultValue={state.values?.name} />
      <Checkbox label="Li o documento acima na íntegra e aceito seus termos." name="agree" />
      <p className="text-xs text-text-muted">Ao aceitar, registramos data, hora, seu nome e o endereço de rede, vinculados ao texto exato deste documento.</p>
      <SubmitButton pendingText="Registrando…">Aceitar</SubmitButton>
    </form>
  );
}
