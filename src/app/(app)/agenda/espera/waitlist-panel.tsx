"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { PERIOD_LABEL, WEEKDAY_LABEL, type DayPeriod } from "@/lib/waitlist-match";
import { addToWaitlistAction, offerSlotAction, removeFromWaitlistAction, togglePriorityAction } from "./actions";

type Opt = { value: string; label: string };

export type WaitlistRow = {
  id: string;
  status: "WAITING" | "OFFERED";
  patientId: string;
  patientName: string;
  whatsapp: string;
  prefs: string;
  serviceName: string | null;
  note: string | null;
  source: "PUBLIC_PAGE" | "MANUAL" | "RECURRING" | "WAITLIST";
  priority: boolean;
  offersCount: number;
  waitingSince: string;
  offered: { appointmentId: string; label: string } | null;
  serviceModality: "IN_PERSON" | "ONLINE" | "HYBRID" | null;
};

/** Checkboxes de preferência, compartilhados entre painel e página pública. */
export function PrefsFields({ defaults, showModality = true }: { defaults?: { modality?: string | null; weekdays?: number[]; periods?: DayPeriod[] }; showModality?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {showModality && (
        <Select
          label="Modalidade"
          name="modality"
          options={[
            { value: "", label: "Tanto faz" },
            { value: "ONLINE", label: "Online" },
            { value: "IN_PERSON", label: "Presencial" },
          ]}
          defaultValue={defaults?.modality ?? ""}
        />
      )}
      <fieldset>
        <legend className="label">Dias possíveis</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
              <input type="checkbox" name="weekdays" value={d} className="sr-only" defaultChecked={defaults?.weekdays?.includes(d)} />
              {WEEKDAY_LABEL[d]}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-text-muted">Nenhum marcado = qualquer dia.</p>
      </fieldset>
      <fieldset>
        <legend className="label">Períodos</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(PERIOD_LABEL) as DayPeriod[]).map((p) => (
            <label key={p} className="cursor-pointer rounded-md border border-border px-2 py-1 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
              <input type="checkbox" name="periods" value={p} className="sr-only" defaultChecked={defaults?.periods?.includes(p)} />
              {PERIOD_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function AddForm({ patients, services }: { patients: Opt[]; services: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(addToWaitlistAction, {});
  if (!open && !state.ok) {
    return (
      <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
        + Adicionar à lista
      </button>
    );
  }
  return (
    <form action={action} className="card space-y-4" key={state.ok ? "saved" : "editing"}>
      <div>
        <h2 className="text-base font-semibold">Adicionar à lista de espera</h2>
        <p className="mt-1 text-sm text-text-muted">Paciente já cadastrado que pediu um horário que não existe ainda, ou quer antecipar.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Adicionado à lista." />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Paciente" name="patientId" options={[{ value: "", label: "Escolha…" }, ...patients]} defaultValue={state.values?.patientId} errors={state.fieldErrors?.patientId} />
        <Select label="Serviço" name="serviceId" options={[{ value: "", label: "Qualquer / principal" }, ...services]} defaultValue={state.values?.serviceId} errors={state.fieldErrors?.serviceId} />
      </div>
      <PrefsFields defaults={{ modality: state.values?.modality }} />
      <Field label="Observação" name="note" required={false} placeholder="Ex.: só depois das 17h; pediu para avisar por ligação" defaultValue={state.values?.note} errors={state.fieldErrors?.note} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="priority" className="h-4 w-4" /> Prioridade (vai para o topo da lista)
      </label>
      <div className="flex gap-2">
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">Adicionar</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Fechar
        </button>
      </div>
    </form>
  );
}

export function WaitlistTable({ rows, today }: { rows: WaitlistRow[]; today: string }) {
  if (rows.length === 0) return <p className="card text-sm text-text-muted">Ninguém na lista de espera deste profissional.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.id} className={`card ${r.priority ? "border-primary/50" : ""}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                <span className="mr-2 text-text-muted">{i + 1}.</span>
                <Link href={`/pacientes/${r.patientId}`} className="hover:text-primary">
                  {r.patientName}
                </Link>
                {r.priority && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">prioridade</span>}
                {r.source === "PUBLIC_PAGE" && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">pela página pública</span>}
              </p>
              <p className="text-sm text-text-muted">
                {r.prefs}
                {r.serviceName && <> · {r.serviceName}</>}
              </p>
              <p className="text-xs text-text-muted">
                {r.whatsapp} · aguardando desde {r.waitingSince}
                {r.offersCount > 0 && <> · {r.offersCount} oferta(s) anterior(es)</>}
              </p>
              {r.note && <p className="mt-1 text-xs italic text-text-muted">{r.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <PriorityButton id={r.id} priority={r.priority} />
              <RemoveForm id={r.id} />
            </div>
          </div>
          <div className="mt-3 border-t border-border pt-3">
            {r.status === "OFFERED" && r.offered ? (
              <p className="text-sm">
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">oferta em aberto</span>{" "}
                <Link href={`/agenda/${r.offered.appointmentId}`} className="text-primary hover:underline">
                  {r.offered.label}
                </Link>{" "}
                <span className="text-text-muted">— horário reservado até a pessoa confirmar ou o prazo vencer.</span>
              </p>
            ) : (
              <OfferForm id={r.id} today={today} serviceModality={r.serviceModality} />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function OfferForm({ id, today, serviceModality }: { id: string; today: string; serviceModality: WaitlistRow["serviceModality"] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(offerSlotAction.bind(null, id), {});
  if (!open) {
    return (
      <button type="button" className="btn-ghost text-sm" onClick={() => setOpen(true)}>
        Oferecer horário…
      </button>
    );
  }
  const modalityOpts =
    serviceModality === "ONLINE"
      ? [{ value: "ONLINE", label: "Online" }]
      : serviceModality === "IN_PERSON"
        ? [{ value: "IN_PERSON", label: "Presencial" }]
        : [
            { value: "ONLINE", label: "Online" },
            { value: "IN_PERSON", label: "Presencial" },
          ];
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <Field label="Data" name="date" type="date" defaultValue={state.values?.date ?? today} errors={state.fieldErrors?.date} />
      </div>
      <div className="w-28">
        <Field label="Hora" name="time" type="time" defaultValue={state.values?.time} errors={state.fieldErrors?.time} />
      </div>
      <div className="w-36">
        <Select label="Modalidade" name="modality" options={modalityOpts} defaultValue={state.values?.modality ?? modalityOpts[0].value} errors={state.fieldErrors?.modality} />
      </div>
      <div className="w-36">
        <SubmitButton pendingText="Enviando…">Oferecer</SubmitButton>
      </div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      <div className="basis-full">
        <FormError message={state.error} />
      </div>
    </form>
  );
}

function PriorityButton({ id, priority }: { id: string; priority: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="text-xs text-text-muted hover:text-primary disabled:opacity-50" disabled={pending} onClick={() => start(() => togglePriorityAction(id, !priority))}>
      {priority ? "Tirar prioridade" : "Priorizar"}
    </button>
  );
}

function RemoveForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(removeFromWaitlistAction.bind(null, id), {});
  if (!open) {
    return (
      <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Remover
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-2">
      <div className="min-w-44">
        <Field label="Motivo" name="reason" placeholder="Ex.: conseguiu em outro lugar" errors={state.fieldErrors?.reason} />
      </div>
      <FormError message={state.error} />
      <div className="w-28">
        <SubmitButton pendingText="…">Remover</SubmitButton>
      </div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </form>
  );
}
