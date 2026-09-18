"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { loginAction, type FormState } from "../actions";

export function LoginForm({ justReset }: { justReset: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4">
      {justReset && <FormSuccess message="Senha redefinida. Entre com a nova senha." />}
      <FormError message={state.error} />
      <Field label="E-mail" name="email" type="email" autoComplete="email" errors={state.fieldErrors?.email} />
      <Field
        label="Senha"
        name="password"
        type="password"
        autoComplete="current-password"
        errors={state.fieldErrors?.password}
      />
      <div className="flex justify-end">
        <Link href="/recuperar-senha" className="text-xs text-text-muted hover:text-primary hover:underline">
          Esqueci minha senha
        </Link>
      </div>
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
