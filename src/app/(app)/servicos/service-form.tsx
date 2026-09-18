"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Checkbox, Field, FormError, Select, SubmitButton, TextArea } from "@/components/ui/form";
import { centsToInput } from "@/lib/money";
import { createServiceAction, updateServiceAction, type ServiceFormState } from "./actions";

export const MODALITY_OPTIONS = [
  { value: "IN_PERSON", label: "Presencial" },
  { value: "ONLINE", label: "Online" },
  { value: "HYBRID", label: "Presencial ou online (paciente escolhe)" },
] as const;

export type ServiceFormValues = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  modality: "IN_PERSON" | "ONLINE" | "HYBRID";
  patientInstructions: string | null;
  isActive: boolean;
};

export function ServiceForm({
  service,
  defaultDuration,
}: {
  service?: ServiceFormValues;
  defaultDuration: number;
}) {
  const action = service ? updateServiceAction.bind(null, service.id) : createServiceAction;
  const [state, formAction] = useActionState<ServiceFormState, FormData>(action, {});
  const fe = state.fieldErrors;
  // Apos falha de validacao o React reseta o form; repovoamos com o enviado.
  const v = state.values;

  return (
    <form action={formAction} className="card max-w-2xl space-y-5">
      <FormError message={state.error} />

      <Field
        label="Nome do atendimento"
        name="name"
        placeholder="Ex.: Psicoterapia individual"
        defaultValue={v?.name ?? service?.name}
        errors={fe?.name}
      />

      <TextArea
        label="Descrição"
        name="description"
        hint="Aparece na página pública, abaixo do nome. Opcional."
        defaultValue={v?.description ?? service?.description}
        errors={fe?.description}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Duração (minutos)"
          name="durationMinutes"
          type="number"
          inputMode="numeric"
          defaultValue={v?.durationMinutes ?? service?.durationMinutes ?? defaultDuration}
          errors={fe?.durationMinutes}
        />
        <Field
          label="Valor (R$)"
          name="price"
          inputMode="decimal"
          placeholder="250,00"
          defaultValue={v?.price ?? (service ? centsToInput(service.priceCents) : undefined)}
          errors={fe?.price}
        />
      </div>

      <Select
        label="Modalidade"
        name="modality"
        options={MODALITY_OPTIONS}
        defaultValue={v?.modality ?? service?.modality ?? "IN_PERSON"}
        errors={fe?.modality}
      />

      <TextArea
        label="Orientações ao paciente"
        name="patientInstructions"
        rows={4}
        placeholder="Ex.: Chegue com 10 minutos de antecedência. Para sessões online, o link será enviado por WhatsApp."
        hint="Enviadas ao paciente após a confirmação. Não inclua informações clínicas."
        defaultValue={v?.patientInstructions ?? service?.patientInstructions}
        errors={fe?.patientInstructions}
      />

      <Checkbox
        label="Disponível para agendamento"
        name="isActive"
        defaultChecked={v ? v.isActive === "on" : (service?.isActive ?? true)}
        hint="Desmarque para ocultar da página pública sem perder o histórico."
      />

      <div className="flex items-center justify-end gap-3 border-t border-border pt-5">
        <Link href="/servicos" className="btn-ghost">
          Cancelar
        </Link>
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">{service ? "Salvar alterações" : "Criar serviço"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
