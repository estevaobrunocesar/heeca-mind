"use client";

import { useActionState, useState } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import { DELEGATION_KIND_LABEL, MAX_DELEGATION_DAYS, type DelegationKind } from "@/lib/clinical-delegation";
import type { FormState } from "@/lib/form";
import { grantDelegationAction, revokeDelegationAction } from "./actions";

type Opt = { value: string; label: string };
export type DelegationRow = {
  id: string;
  kind: DelegationKind;
  reason: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  active: boolean;
  patientName: string | null;
  grantorName: string;
  delegateName: string;
};

export function GrantForm({ professionals, patients, today }: { professionals: Opt[]; patients: Opt[]; today: string }) {
  const [state, action] = useActionState<FormState, FormData>(grantDelegationAction, {});
  const fe = state.fieldErrors;
  const v = state.values;
  return (
    <form action={action} className="card space-y-4" key={state.ok ? "saved" : "editing"}>
      <div>
        <h2 className="text-base font-semibold">Delegar acesso ao prontuário</h2>
        <p className="mt-1 text-sm text-text-muted">
          Para supervisão ou substituição (férias, licença). Vale só no período, só para o colega escolhido, e cada acesso dele fica registrado. Você pode
          revogar a qualquer momento.
        </p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Delegação criada." />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Para" name="delegateProfessionalId" options={[{ value: "", label: "Escolha…" }, ...professionals]} defaultValue={v?.delegateProfessionalId} errors={fe?.delegateProfessionalId} />
        <Select
          label="Tipo"
          name="kind"
          options={(Object.keys(DELEGATION_KIND_LABEL) as DelegationKind[]).map((k) => ({ value: k, label: DELEGATION_KIND_LABEL[k] }))}
          defaultValue={v?.kind ?? "SUPERVISION"}
          errors={fe?.kind}
        />
        <div className="sm:col-span-2">
          <Select
            label="Paciente"
            name="patientId"
            options={[{ value: "", label: "Todos os meus pacientes (substituição integral)" }, ...patients]}
            defaultValue={v?.patientId}
            hint="Um paciente para supervisão de caso; todos para cobrir uma ausência."
          />
        </div>
        <Field label="De" name="startsOn" type="date" defaultValue={v?.startsOn ?? today} errors={fe?.startsOn} />
        <Field label="Até" name="endsOn" type="date" defaultValue={v?.endsOn} errors={fe?.endsOn} hint={`Máximo de ${MAX_DELEGATION_DAYS} dias.`} />
        <div className="sm:col-span-2">
          <Field label="Motivo" name="reason" placeholder="Ex.: férias 20–30/09 · supervisão do caso" defaultValue={v?.reason} errors={fe?.reason} />
        </div>
      </div>
      <div className="w-44">
        <SubmitButton pendingText="Salvando…">Delegar</SubmitButton>
      </div>
    </form>
  );
}

export function DelegationList({ rows, mine }: { rows: DelegationRow[]; mine: boolean }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{mine ? "Você não delegou nenhum prontuário." : "Ninguém delegou um prontuário a você."}</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
          <div className="min-w-0 text-sm">
            <p className="font-medium">
              {mine ? `Para ${r.delegateName}` : `De ${r.grantorName}`} · {r.patientName ?? "todos os pacientes"}
            </p>
            <p className="text-text-muted">
              {DELEGATION_KIND_LABEL[r.kind]} · {r.startsAt} → {r.expiresAt}
            </p>
            <p className="text-xs text-text-muted">{r.reason}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.active ? "bg-primary-soft text-primary" : "bg-surface-muted text-text-muted"}`}>
              {r.revokedAt ? "revogada" : r.active ? "vigente" : "fora do período"}
            </span>
            {mine && !r.revokedAt && <RevokeForm id={r.id} />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function RevokeForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(revokeDelegationAction.bind(null, id), {});
  if (!open) {
    return (
      <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Revogar
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-2">
      <div className="min-w-48">
        <Field label="Motivo" name="reason" placeholder="Ex.: retornei das férias" errors={state.fieldErrors?.reason} />
      </div>
      <FormError message={state.error} />
      <div className="w-28">
        <SubmitButton pendingText="…">Revogar</SubmitButton>
      </div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </form>
  );
}
