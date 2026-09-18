"use client";

import { useActionState, useState, useTransition } from "react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { Field, FormError, FormSuccess, Select, SubmitButton, TextArea } from "@/components/ui/form";
import { availableActions, type AppointmentAction } from "@/lib/appointment-status";
import type { FormState } from "@/lib/form";
import {
  cancelAppointmentAction,
  completeAppointmentAction,
  confirmAppointmentAction,
  noShowAppointmentAction,
  requestConfirmationAction,
  rescheduleAppointmentAction,
  updateAdminNoteAction,
  updateOnlineLinkAction,
} from "../actions";

type S = FormState & { appointmentId: string };

export function StatusActions({ id, status, inSeries }: { id: string; status: AppointmentStatus; inSeries: boolean }) {
  const [pending, start] = useTransition();
  const [panel, setPanel] = useState<"cancel" | "reschedule" | null>(null);
  const actions = new Set(availableActions(status));

  const btn = (action: AppointmentAction, label: string, fn: () => Promise<void>, tone = "btn-ghost") =>
    actions.has(action) ? (
      <button key={action} type="button" className={tone} disabled={pending} onClick={() => start(fn)}>
        {label}
      </button>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {btn("confirm", "Confirmar", () => confirmAppointmentAction(id), "btn-primary")}
        {btn("request_confirmation", "Pedir confirmação por WhatsApp", () => requestConfirmationAction(id))}
        {btn("complete", "Marcar como concluída", () => completeAppointmentAction(id))}
        {btn("no_show", "Não compareceu", () => noShowAppointmentAction(id))}
        {actions.has("reschedule") && (
          <button type="button" className="btn-ghost" onClick={() => setPanel(panel === "reschedule" ? null : "reschedule")}>
            Reagendar
          </button>
        )}
        {actions.has("cancel_by_professional") && (
          <button type="button" className="btn-ghost hover:text-danger" onClick={() => setPanel(panel === "cancel" ? null : "cancel")}>
            Cancelar
          </button>
        )}
      </div>
      {panel === "cancel" && <CancelForm id={id} inSeries={inSeries} />}
      {panel === "reschedule" && <RescheduleForm id={id} />}
    </div>
  );
}

function CancelForm({ id, inSeries }: { id: string; inSeries: boolean }) {
  const [state, action] = useActionState<S, FormData>(cancelAppointmentAction, { appointmentId: id });
  return (
    <form action={action} className="space-y-3 rounded-lg border border-danger/30 bg-danger-soft/40 p-4">
      <FormError message={state.error} />
      <Select
        label="Cancelado por"
        name="by"
        options={[
          { value: "professional", label: "Mim (profissional)" },
          { value: "patient", label: "Paciente (avisou por fora)" },
        ]}
        defaultValue={state.values?.by ?? "professional"}
      />
      {inSeries && (
        <Select
          label="Abrangência"
          name="scope"
          options={[
            { value: "one", label: "Só esta sessão" },
            { value: "series", label: "Esta e todas as próximas da série" },
          ]}
          defaultValue={state.values?.scope ?? "one"}
        />
      )}
      <TextArea label="Motivo (opcional, administrativo)" name="reason" rows={2} defaultValue={state.values?.reason} errors={state.fieldErrors?.reason} />
      <p className="text-xs text-text-muted">O paciente receberá a mensagem de cancelamento por WhatsApp.</p>
      <div className="w-48">
        <SubmitButton pendingText="Cancelando…">Confirmar cancelamento</SubmitButton>
      </div>
    </form>
  );
}

function RescheduleForm({ id }: { id: string }) {
  const [state, action] = useActionState<S, FormData>(rescheduleAppointmentAction, { appointmentId: id });
  return (
    <form action={action} className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-4">
      <FormError message={state.error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nova data" name="date" type="date" defaultValue={state.values?.date} errors={state.fieldErrors?.date} />
        <Field label="Novo horário" name="time" type="time" defaultValue={state.values?.time} errors={state.fieldErrors?.time} />
      </div>
      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input type="checkbox" name="force" className="accent-primary" /> Ignorar conflitos (encaixe)
      </label>
      <p className="text-xs text-text-muted">A sessão fica confirmada no novo horário e o paciente é avisado.</p>
      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Reagendar</SubmitButton>
      </div>
    </form>
  );
}

export function AdminNoteForm({ id, note }: { id: string; note: string | null }) {
  const [state, action] = useActionState<S, FormData>(updateAdminNoteAction, { appointmentId: id });
  return (
    <form action={action} className="space-y-2">
      {state.ok && <FormSuccess message="Observação salva." />}
      <TextArea
        label="Observação administrativa"
        name="adminNote"
        rows={3}
        hint="Logística, pagamento, preferências. Nunca conteúdo clínico."
        defaultValue={state.values?.adminNote ?? note}
        errors={state.fieldErrors?.adminNote}
      />
      <div className="w-32">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}

export function OnlineLinkForm({ id, link, fixedLink }: { id: string; link: string | null; fixedLink: string | null }) {
  const [state, action] = useActionState<S, FormData>(updateOnlineLinkAction, { appointmentId: id });
  return (
    <form action={action} className="space-y-2">
      {state.ok && <FormSuccess message="Link salvo." />}
      <Field
        label="Link da sessão online"
        name="onlineLink"
        required={false}
        placeholder={fixedLink ?? "https://…"}
        hint={fixedLink ? "Vazio = usa o link fixo do seu perfil." : "Enviado ao paciente no dia da sessão."}
        defaultValue={state.values?.onlineLink ?? link}
        errors={state.fieldErrors?.onlineLink}
      />
      <div className="w-32">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
