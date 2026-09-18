"use client";

import { useActionState } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { updateScheduleSettingsAction } from "../actions";

export type SettingsValues = {
  defaultDurationMinutes: number;
  bufferMinutes: number;
  slotStepMinutes: number;
  minAdvanceHours: number;
  minCancelHours: number;
  minRescheduleHours: number;
  maxSessionsPerDay: number | null;
  lateToleranceMinutes: number;
  maxBookingDaysAhead: number;
};

const STEP_OPTIONS = [
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "60 min" },
];

export function SettingsForm({ settings }: { settings: SettingsValues }) {
  const [state, action] = useActionState<FormState, FormData>(updateScheduleSettingsAction, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = (k: keyof SettingsValues) => v?.[k] ?? (settings[k] === null ? "" : String(settings[k]));

  return (
    <form action={action} className="card">
      <h2 className="text-base font-semibold">Regras de agendamento</h2>
      <p className="mt-1 text-sm text-text-muted">
        Controlam quais horários aparecem na página pública e os prazos que o paciente precisa respeitar.
      </p>

      <div className="mt-5 space-y-4">
        <FormError message={state.error} />
        {state.ok && <FormSuccess message="Regras salvas." />}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Duração padrão (min)" name="defaultDurationMinutes" type="number" inputMode="numeric" defaultValue={val("defaultDurationMinutes")} errors={fe?.defaultDurationMinutes} hint="Sugerida ao criar serviços." />
          <Field label="Intervalo entre sessões (min)" name="bufferMinutes" type="number" inputMode="numeric" defaultValue={val("bufferMinutes")} errors={fe?.bufferMinutes} hint="Respiro entre um atendimento e o próximo." />
          <Select label="Passo dos horários" name="slotStepMinutes" options={STEP_OPTIONS} defaultValue={val("slotStepMinutes")} errors={fe?.slotStepMinutes} hint="De quanto em quanto os horários são oferecidos." />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Antecedência mínima (horas)" name="minAdvanceHours" type="number" inputMode="numeric" defaultValue={val("minAdvanceHours")} errors={fe?.minAdvanceHours} hint="Para agendar pela página pública." />
          <Field label="Prazo p/ cancelar (horas)" name="minCancelHours" type="number" inputMode="numeric" defaultValue={val("minCancelHours")} errors={fe?.minCancelHours} />
          <Field label="Prazo p/ reagendar (horas)" name="minRescheduleHours" type="number" inputMode="numeric" defaultValue={val("minRescheduleHours")} errors={fe?.minRescheduleHours} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Máx. de sessões por dia" name="maxSessionsPerDay" type="number" inputMode="numeric" required={false} placeholder="sem limite" defaultValue={val("maxSessionsPerDay")} errors={fe?.maxSessionsPerDay} />
          <Field label="Tolerância de atraso (min)" name="lateToleranceMinutes" type="number" inputMode="numeric" defaultValue={val("lateToleranceMinutes")} errors={fe?.lateToleranceMinutes} />
          <Field label="Agenda aberta por (dias)" name="maxBookingDaysAhead" type="number" inputMode="numeric" defaultValue={val("maxBookingDaysAhead")} errors={fe?.maxBookingDaysAhead} hint="Até quantos dias à frente o paciente enxerga." />
        </div>

        <div className="flex justify-end">
          <div className="w-40">
            <SubmitButton pendingText="Salvando…">Salvar regras</SubmitButton>
          </div>
        </div>
      </div>
    </form>
  );
}
