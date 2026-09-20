"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Checkbox, Field, FormError, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { centsToInput } from "@/lib/money";
import { createPackageAction, updatePackageAction } from "./actions";

export type PackageFormValues = {
  id: string;
  name: string;
  description: string | null;
  sessionsCount: number;
  priceCents: number;
  validityDays: number;
  serviceIds: string[];
  isActive: boolean;
};

export function PackageForm({ pkg, services }: { pkg?: PackageFormValues; services: { id: string; name: string }[] }) {
  const action = pkg ? updatePackageAction.bind(null, pkg.id) : createPackageAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = (k: keyof PackageFormValues) => v?.[k] ?? (pkg?.[k] == null ? undefined : String(pkg[k]));
  // Após falha de validação, FormData só devolve o último checkbox marcado — degradação aceitável.
  const checkedServices = new Set(v ? (v.serviceIds ? [v.serviceIds] : []) : (pkg?.serviceIds ?? []));

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <section className="card space-y-4">
        <Field label="Nome" name="name" placeholder="Ex.: Pacote 5 sessões" defaultValue={val("name")} errors={fe?.name} />
        <TextArea label="Descrição" name="description" rows={2} placeholder="O que está incluído, condições." defaultValue={val("description")} errors={fe?.description} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sessões" name="sessionsCount" type="number" inputMode="numeric" defaultValue={val("sessionsCount")} errors={fe?.sessionsCount} />
          <Field label="Valor total (R$)" name="price" inputMode="decimal" placeholder="1.000,00" defaultValue={v?.price ?? (pkg ? centsToInput(pkg.priceCents) : undefined)} errors={fe?.price} />
          <Field label="Validade (dias)" name="validityDays" type="number" inputMode="numeric" placeholder="90" defaultValue={val("validityDays") ?? "90"} errors={fe?.validityDays} hint="Contada a partir da venda." />
        </div>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="text-base font-semibold">Serviços cobertos</h2>
          <p className="mt-1 text-sm text-text-muted">Nenhum marcado = qualquer serviço seu. Marque para restringir (ex.: só sessão individual).</p>
        </div>
        {services.length === 0 ? (
          <p className="text-sm text-text-muted">Você ainda não tem serviços cadastrados.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <Checkbox key={s.id} label={s.name} name="serviceIds" value={s.id} defaultChecked={checkedServices.has(s.id)} />
            ))}
          </div>
        )}
        {fe?.serviceIds && <p className="field-error">{fe.serviceIds[0]}</p>}
      </section>

      <section className="card">
        <Checkbox label="Disponível para venda" name="isActive" defaultChecked={v ? v.isActive === "on" : (pkg?.isActive ?? true)} />
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link href="/pacotes" className="btn-ghost">
          Cancelar
        </Link>
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">{pkg ? "Salvar" : "Criar pacote"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
