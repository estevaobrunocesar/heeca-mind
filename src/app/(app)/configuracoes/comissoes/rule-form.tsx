"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { endCommissionRuleAction, saveCommissionRuleAction } from "../../financeiro/comissoes/actions";

type Pro = { id: string; displayName: string; services: { id: string; name: string }[] };

export function RuleForm({ professionals }: { professionals: Pro[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveCommissionRuleAction, {});
  const [proId, setProId] = useState(state.values?.professionalId ?? professionals[0]?.id ?? "");
  const [mode, setMode] = useState<"percent" | "fixed">((state.values?.mode as "percent" | "fixed") ?? "percent");
  const pro = professionals.find((p) => p.id === proId);
  const today = new Date().toISOString().slice(0, 10);
  if (professionals.length === 0) return null;
  return (
    <form action={action} className="card space-y-4">
      <h2 className="text-base font-semibold">Nova regra</h2>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Regra criada." />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="field-professionalId" className="label">
            Profissional
          </label>
          <select id="field-professionalId" name="professionalId" className="input" value={proId} onChange={(e) => setProId(e.target.value)}>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
        <Select key={proId} label="Serviço" name="serviceId" options={[{ value: "", label: "Geral (qualquer serviço e pacotes)" }, ...(pro?.services ?? []).map((s) => ({ value: s.id, label: s.name }))]} defaultValue={state.values?.serviceId ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr_1fr]">
        <div>
          <label htmlFor="field-mode" className="label">
            Tipo
          </label>
          <select id="field-mode" name="mode" className="input" value={mode} onChange={(e) => setMode(e.target.value as "percent" | "fixed")}>
            <option value="percent">Percentual do recebido</option>
            <option value="fixed">Valor fixo por sessão</option>
          </select>
        </div>
        {mode === "percent" ? (
          <Field label="Percentual (%)" name="percent" inputMode="decimal" placeholder="30" defaultValue={state.values?.percent} errors={state.fieldErrors?.percent} />
        ) : (
          <Field label="Valor por sessão (R$)" name="fixed" inputMode="decimal" placeholder="80,00" defaultValue={state.values?.fixed} errors={state.fieldErrors?.fixed} />
        )}
        <input type="hidden" name={mode === "percent" ? "fixed" : "percent"} value="" />
        <Field label="Vigência a partir de" name="validFrom" type="date" defaultValue={state.values?.validFrom ?? today} errors={state.fieldErrors?.validFrom} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Até (opcional)" name="validTo" type="date" required={false} defaultValue={state.values?.validTo} errors={state.fieldErrors?.validTo} />
        <Field label="Observação" name="note" required={false} defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      </div>
      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Criar regra</SubmitButton>
      </div>
    </form>
  );
}

export function RuleRowActions({ ruleId }: { ruleId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="shrink-0 text-xs text-text-muted hover:text-danger" disabled={pending} onClick={() => confirm("Encerrar a vigência desta regra a partir de hoje?") && start(() => endCommissionRuleAction(ruleId))}>
      Encerrar
    </button>
  );
}
