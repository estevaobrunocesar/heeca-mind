"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { requestAccessAction } from "./actions";

export function AccessForm({ slug }: { slug: string }) {
  const [state, action] = useActionState<FormState, FormData>(requestAccessAction.bind(null, slug), {});
  if (state.ok) {
    return (
      <div className="card text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-xl text-primary">✓</div>
        <p className="font-medium">Se este número estiver cadastrado, você receberá um link por WhatsApp.</p>
        <p className="mt-1 text-sm text-text-muted">O link vale por 15 minutos e funciona uma única vez. Não recebeu? Confira o número ou fale com o profissional.</p>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4">
      <FormError message={state.error} />
      <Field label="Seu WhatsApp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-0000" hint="O mesmo número usado nos agendamentos." defaultValue={state.values?.whatsapp} errors={state.fieldErrors?.whatsapp} />
      <SubmitButton pendingText="Enviando…">Receber link de acesso</SubmitButton>
    </form>
  );
}
