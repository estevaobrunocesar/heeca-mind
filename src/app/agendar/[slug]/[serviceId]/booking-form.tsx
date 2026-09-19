"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { createPublicBookingAction } from "../actions";

type S = FormState & { slug: string };

export function BookingForm({
  slug,
  serviceId,
  modality,
  date,
  time,
  cancellationPolicy,
  patientInstructions,
}: {
  slug: string;
  serviceId: string;
  modality: "IN_PERSON" | "ONLINE";
  date: string;
  time: string;
  cancellationPolicy: string | null;
  patientInstructions: string | null;
}) {
  const [state, action] = useActionState<S, FormData>(createPublicBookingAction, { slug });
  const fe = state.fieldErrors;
  const v = state.values;

  return (
    <form action={action} className="card space-y-4 p-4">
      <input type="hidden" name="serviceId" value={serviceId} />
      <input type="hidden" name="modality" value={modality} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="time" value={time} />
      {/* honeypot — escondido de humanos, preenchido por bots */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Site <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <FormError message={state.error} />

      <Field label="Nome" name="name" autoComplete="name" defaultValue={v?.name} errors={fe?.name} />
      <Field
        label="WhatsApp"
        name="whatsapp"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="(11) 99999-0000"
        hint="Você receberá a confirmação por aqui."
        defaultValue={v?.whatsapp}
        errors={fe?.whatsapp}
      />
      <Field label="E-mail" name="email" type="email" autoComplete="email" required={false} defaultValue={v?.email} errors={fe?.email} />
      <TextArea
        label="Observação (opcional)"
        name="note"
        rows={2}
        placeholder="Ex.: prefiro que me chame de Bia; tenho dificuldade de acesso."
        hint="Apenas informações práticas. Não é necessário descrever o motivo da consulta."
        defaultValue={v?.note}
        errors={fe?.note}
      />

      {patientInstructions && (
        <div className="rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
          <p className="mb-1 font-medium text-text">Orientações</p>
          <p>{patientInstructions}</p>
        </div>
      )}
      {cancellationPolicy && (
        <div className="rounded-lg bg-surface-muted p-3 text-xs text-text-muted">
          <p className="mb-1 font-medium text-text">Política de cancelamento</p>
          <p>{cancellationPolicy}</p>
        </div>
      )}

      <div>
        <label className="flex items-start gap-2 text-xs text-text-muted">
          <input type="checkbox" name="consent" className="mt-0.5 accent-primary" defaultChecked={v?.consent === "on"} />
          <span>
            Autorizo o uso do meu nome e contato para organizar este atendimento e receber mensagens sobre ele, conforme a
            LGPD. Nenhuma informação clínica é coletada nesta página.
          </span>
        </label>
        {fe?.consent && <p className="field-error">{fe.consent[0]}</p>}
      </div>

      <SubmitButton pendingText="Enviando…">Solicitar agendamento</SubmitButton>
      <p className="text-center text-xs text-text-muted">
        Você receberá uma mensagem no WhatsApp para confirmar o horário.
      </p>
    </form>
  );
}
