"use client";

import { useActionState, useTransition } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { createBlockAction, createExceptionAction, deleteBlockAction, deleteExceptionAction } from "../actions";

const TYPE_OPTIONS = [
  { value: "BLOCK", label: "Bloqueio pontual" },
  { value: "DAY_OFF", label: "Folga" },
  { value: "VACATION", label: "Férias" },
];

export function BlockForm() {
  const [state, action] = useActionState<FormState, FormData>(createBlockAction, {});
  const fe = state.fieldErrors;
  const v = state.values;

  return (
    <form action={action} className="card">
      <h2 className="text-base font-semibold">Novo bloqueio</h2>
      <p className="mt-1 text-sm text-text-muted">
        Período em que você não atende. Deixe os horários em branco para bloquear o dia inteiro.
      </p>
      <div className="mt-5 space-y-4">
        <FormError message={state.error} />
        {state.ok && <FormSuccess message="Bloqueio criado." />}
        <Select label="Tipo" name="type" options={TYPE_OPTIONS} defaultValue={v?.type ?? "BLOCK"} errors={fe?.type} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Início (data)" name="startDate" type="date" defaultValue={v?.startDate} errors={fe?.startDate} />
          <Field label="Início (hora)" name="startTime" type="time" required={false} defaultValue={v?.startTime} errors={fe?.startTime} />
          <Field label="Fim (data)" name="endDate" type="date" defaultValue={v?.endDate} errors={fe?.endDate} />
          <Field label="Fim (hora)" name="endTime" type="time" required={false} defaultValue={v?.endTime} errors={fe?.endTime} />
        </div>
        <Field label="Motivo" name="reason" required={false} placeholder="Ex.: congresso, consulta médica" defaultValue={v?.reason} errors={fe?.reason} hint="Só você vê." />
        <div className="flex justify-end">
          <div className="w-40">
            <SubmitButton pendingText="Salvando…">Criar bloqueio</SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}

export function ExceptionForm() {
  const [state, action] = useActionState<FormState, FormData>(createExceptionAction, {});
  const fe = state.fieldErrors;
  const v = state.values;

  return (
    <form action={action} className="card">
      <h2 className="text-base font-semibold">Horário excepcional</h2>
      <p className="mt-1 text-sm text-text-muted">
        Um dia em que você atende fora da grade semanal — ex.: um sábado específico.
      </p>
      <div className="mt-5 space-y-4">
        <FormError message={state.error} />
        {state.ok && <FormSuccess message="Horário excepcional criado." />}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Data" name="date" type="date" defaultValue={v?.date} errors={fe?.date} />
          <Field label="Início" name="startTime" type="time" defaultValue={v?.startTime} errors={fe?.startTime} />
          <Field label="Fim" name="endTime" type="time" defaultValue={v?.endTime} errors={fe?.endTime} />
        </div>
        <Field label="Observação" name="note" required={false} defaultValue={v?.note} errors={fe?.note} />
        <div className="flex justify-end">
          <div className="w-40">
            <SubmitButton pendingText="Salvando…">Adicionar</SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}

export function DeleteButton({ kind, id }: { kind: "block" | "exception"; id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Remover?")) return;
        start(() => (kind === "block" ? deleteBlockAction(id) : deleteExceptionAction(id)));
      }}
      className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-danger disabled:opacity-40"
    >
      Remover
    </button>
  );
}
