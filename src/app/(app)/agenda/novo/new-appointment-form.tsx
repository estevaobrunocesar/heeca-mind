"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, FormError, Select, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { createAppointmentAction } from "../actions";

type ServiceOpt = { id: string; name: string; modality: "IN_PERSON" | "ONLINE" | "HYBRID"; durationMinutes: number };
type PatientOpt = { id: string; name: string; whatsapp: string };

export function NewAppointmentForm({
  services,
  patients,
  defaultDate,
  defaultTime,
  defaultPatientId,
}: {
  services: ServiceOpt[];
  patients: PatientOpt[];
  defaultDate: string;
  defaultTime?: string;
  defaultPatientId?: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(createAppointmentAction, {});
  const fe = state.fieldErrors;
  const v = state.values;

  const [patientMode, setPatientMode] = useState<"existing" | "new">(patients.length > 0 && !v?.newPatientName ? "existing" : "new");
  const [serviceId, setServiceId] = useState(v?.serviceId ?? services[0]?.id ?? "");
  const [recurrence, setRecurrence] = useState(v?.recurrence ?? "NONE");
  const service = services.find((s) => s.id === serviceId);

  const modalityOptions =
    service?.modality === "HYBRID"
      ? [
          { value: "IN_PERSON", label: "Presencial" },
          { value: "ONLINE", label: "Online" },
        ]
      : service
        ? [{ value: service.modality, label: service.modality === "ONLINE" ? "Online" : "Presencial" }]
        : [];

  return (
    <form action={action} className="card max-w-2xl space-y-5">
      <FormError message={state.error} />

      <fieldset className="space-y-3">
        <legend className="label">Paciente</legend>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${patientMode === "existing" ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:bg-surface-muted"}`}
            onClick={() => setPatientMode("existing")}
            disabled={patients.length === 0}
          >
            Já cadastrado
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${patientMode === "new" ? "bg-primary-soft font-medium text-primary" : "text-text-muted hover:bg-surface-muted"}`}
            onClick={() => setPatientMode("new")}
          >
            Novo paciente
          </button>
        </div>
        {patientMode === "existing" ? (
          <Select
            label="Selecione"
            name="patientId"
            options={patients.map((p) => ({ value: p.id, label: `${p.name} · ${p.whatsapp}` }))}
            defaultValue={v?.patientId ?? defaultPatientId ?? patients[0]?.id}
            errors={fe?.patientId}
          />
        ) : (
          <>
            <input type="hidden" name="patientId" value="" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome" name="newPatientName" required={false} defaultValue={v?.newPatientName} errors={fe?.newPatientName} />
              <Field
                label="WhatsApp"
                name="newPatientWhatsapp"
                type="tel"
                required={false}
                placeholder="(11) 99999-0000"
                hint="Se já existir alguém com este número, a sessão é vinculada a ele."
                defaultValue={v?.newPatientWhatsapp}
                errors={fe?.newPatientWhatsapp}
              />
            </div>
          </>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="field-serviceId" className="label">
            Serviço
          </label>
          <select
            id="field-serviceId"
            name="serviceId"
            className="input"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            aria-invalid={!!fe?.serviceId}
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes} min)
              </option>
            ))}
          </select>
          {fe?.serviceId && <p className="field-error">{fe.serviceId[0]}</p>}
        </div>
        <Select label="Modalidade" name="modality" options={modalityOptions} defaultValue={v?.modality ?? modalityOptions[0]?.value} errors={fe?.modality} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data" name="date" type="date" defaultValue={v?.date ?? defaultDate} errors={fe?.date} />
        <Field label="Horário" name="time" type="time" defaultValue={v?.time ?? defaultTime} errors={fe?.time} />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-4">
        <legend className="px-1 text-sm font-medium">Repetir</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="field-recurrence" className="label">
              Frequência
            </label>
            <select id="field-recurrence" name="recurrence" className="input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
              <option value="NONE">Não repetir</option>
              <option value="WEEKLY">Toda semana</option>
              <option value="BIWEEKLY">A cada duas semanas</option>
            </select>
          </div>
          {recurrence !== "NONE" && (
            <Field label="Até" name="recurrenceUntil" type="date" required={false} defaultValue={v?.recurrenceUntil} errors={fe?.recurrenceUntil} />
          )}
        </div>
        {recurrence !== "NONE" && (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" name="force" className="accent-primary" defaultChecked={v?.force === "on"} /> Pular horários com
            conflito em vez de abortar
          </label>
        )}
      </fieldset>

      <TextArea label="Observação administrativa" name="adminNote" rows={2} hint="Opcional. Nunca conteúdo clínico." defaultValue={v?.adminNote} errors={fe?.adminNote} />

      <p className="text-xs text-text-muted">
        Sessões criadas aqui já nascem <strong>confirmadas</strong> — você combinou diretamente com o paciente. Um lembrete de
        24h é agendado automaticamente.
      </p>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Link href="/agenda" className="btn-ghost">
          Cancelar
        </Link>
        <div className="w-40">
          <SubmitButton pendingText="Criando…">Criar sessão</SubmitButton>
        </div>
      </div>
    </form>
  );
}
