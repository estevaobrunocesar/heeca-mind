"use client";

import { useActionState, useState } from "react";
import type { ClinicalNoteKind } from "@/generated/prisma/enums";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { createClinicalNoteAction, deleteClinicalNoteAction } from "./actions";

type SessionOpt = { id: string; label: string };

const KINDS: Array<{ value: ClinicalNoteKind; label: string; hint: string }> = [
  { value: "EVOLUTION", label: "Evolução de sessão", hint: "Registro do que ocorreu numa sessão específica." },
  { value: "NOTE", label: "Anotação", hint: "Observação livre, hipóteses, planejamento." },
  { value: "ASSESSMENT", label: "Avaliação", hint: "Avaliação psicológica, relatório, encaminhamento." },
];

export function NewNoteForm({ patientId, sessions, defaultAppointmentId }: { patientId: string; sessions: SessionOpt[]; defaultAppointmentId?: string }) {
  const [state, action] = useActionState<FormState, FormData>(createClinicalNoteAction.bind(null, patientId), {});
  const [kind, setKind] = useState<ClinicalNoteKind>(state.values?.kind as ClinicalNoteKind | undefined ?? (defaultAppointmentId ? "EVOLUTION" : sessions.length ? "EVOLUTION" : "NOTE"));
  const fe = state.fieldErrors;

  return (
    <form action={action} className="card space-y-4" key={state.ok ? "saved" : "editing"}>
      <div>
        <h2 className="text-base font-semibold">Nova anotação</h2>
        <p className="mt-1 text-sm text-text-muted">Cifrada no banco. Imutável após salvar — se errar, exclua com motivo e registre de novo.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Anotação registrada." />}

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo">
        {KINDS.map((k) => (
          <label key={k.value} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${kind === k.value ? "border-primary bg-primary-soft text-primary" : "border-border hover:bg-surface-muted"}`}>
            <input type="radio" name="kind" value={k.value} className="sr-only" checked={kind === k.value} onChange={() => setKind(k.value)} />
            <span className="font-medium">{k.label}</span>
            <span className="block text-xs font-normal text-text-muted">{k.hint}</span>
          </label>
        ))}
      </div>

      {kind === "EVOLUTION" ? (
        <div>
          <label htmlFor="field-appointmentId" className="label">
            Sessão
          </label>
          {sessions.length === 0 ? (
            <p className="text-sm text-text-muted">Todas as sessões realizadas já têm evolução registrada.</p>
          ) : (
            <select id="field-appointmentId" name="appointmentId" className="input" defaultValue={defaultAppointmentId ?? sessions[0]?.id} aria-invalid={!!fe?.appointmentId}>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {fe?.appointmentId && <p className="field-error">{fe.appointmentId[0]}</p>}
        </div>
      ) : (
        <input type="hidden" name="appointmentId" value="" />
      )}

      <div>
        <label htmlFor="field-content" className="label">
          Conteúdo
        </label>
        <textarea id="field-content" name="content" rows={10} className="input resize-y font-mono text-sm" defaultValue={state.values?.content} aria-invalid={!!fe?.content} placeholder="Registro clínico…" />
        {fe?.content && <p className="field-error">{fe.content[0]}</p>}
      </div>

      <div className="w-44">
        <SubmitButton pendingText="Salvando…">Salvar anotação</SubmitButton>
      </div>
    </form>
  );
}

export function DeleteNoteForm({ patientId, noteId }: { patientId: string; noteId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(deleteClinicalNoteAction.bind(null, patientId, noteId), {});
  if (!open) {
    return (
      <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Excluir
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
      <div className="min-w-56 flex-1">
        <Field label="Motivo da exclusão" name="reason" placeholder="Ex.: registrado no paciente errado" errors={state.fieldErrors?.reason} />
      </div>
      <FormError message={state.error} />
      <div className="w-32">
        <SubmitButton pendingText="…">Confirmar</SubmitButton>
      </div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </form>
  );
}
