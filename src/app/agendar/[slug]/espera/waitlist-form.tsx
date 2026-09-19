"use client";

import { useActionState } from "react";
import { Field, FormError, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { PERIOD_LABEL, WEEKDAY_LABEL, type DayPeriod } from "@/lib/waitlist-match";
import { joinWaitlistAction } from "./actions";

type S = FormState & { slug: string };
type Opt = { value: string; label: string };

export function PublicWaitlistForm({ slug, services, defaultServiceId, hybrid }: { slug: string; services: Opt[]; defaultServiceId: string | null; hybrid: boolean }) {
  const [state, action] = useActionState<S, FormData>(joinWaitlistAction, { slug });
  const fe = state.fieldErrors;
  const v = state.values;
  return (
    <form action={action} className="card space-y-4 p-4">
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label>
          Site <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <FormError message={state.error} />

      {services.length > 1 && <Select label="Atendimento" name="serviceId" options={services} defaultValue={v?.serviceId ?? defaultServiceId ?? services[0]?.value} />}
      {services.length === 1 && <input type="hidden" name="serviceId" value={services[0].value} />}

      {hybrid && (
        <Select
          label="Modalidade"
          name="modality"
          options={[
            { value: "", label: "Tanto faz" },
            { value: "ONLINE", label: "Online" },
            { value: "IN_PERSON", label: "Presencial" },
          ]}
          defaultValue={v?.modality ?? ""}
        />
      )}

      <fieldset>
        <legend className="label">Dias que funcionam para você</legend>
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
            <label key={d} className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
              <input type="checkbox" name="weekdays" value={d} className="sr-only" />
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
            <label key={p} className="cursor-pointer rounded-md border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
              <input type="checkbox" name="periods" value={p} className="sr-only" />
              {PERIOD_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Nome" name="name" autoComplete="name" defaultValue={v?.name} errors={fe?.name} />
      <Field label="WhatsApp" name="whatsapp" type="tel" autoComplete="tel" inputMode="tel" placeholder="(11) 99999-0000" hint="Avisaremos por aqui quando surgir um horário." defaultValue={v?.whatsapp} errors={fe?.whatsapp} />

      <div>
        <label className="flex items-start gap-2 text-xs text-text-muted">
          <input type="checkbox" name="consent" className="mt-0.5 accent-primary" defaultChecked={v?.consent === "on"} />
          <span>Autorizo o uso do meu nome e contato para me avisar sobre horários disponíveis, conforme a LGPD. Nenhuma informação clínica é coletada nesta página.</span>
        </label>
        {fe?.consent && <p className="field-error">{fe.consent[0]}</p>}
      </div>

      <SubmitButton pendingText="Enviando…">Entrar na lista de espera</SubmitButton>
    </form>
  );
}
