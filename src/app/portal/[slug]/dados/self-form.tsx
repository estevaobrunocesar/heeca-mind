"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { parseCommsPrefs } from "@/lib/comms-prefs";
import type { FormState } from "@/lib/form";
import { updateSelfAction } from "../actions";

type Values = {
  email: string | null;
  phone: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  commsPrefs: unknown;
};

export function SelfForm({ slug, patient }: { slug: string; patient: Values }) {
  const [state, action] = useActionState<FormState, FormData>(updateSelfAction.bind(null, slug), {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = (k: Exclude<keyof Values, "commsPrefs">) => v?.[k] ?? patient[k] ?? undefined;
  const prefs = parseCommsPrefs(patient.commsPrefs);
  const pref = (name: "prefWhatsapp" | "prefReminder24h" | "prefReminder2h", saved: boolean) => (v ? v[name] === "on" : saved);
  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Dados atualizados." />}
      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Contato</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" name="email" type="email" required={false} defaultValue={val("email")} errors={fe?.email} />
          <Field label="Telefone alternativo" name="phone" type="tel" inputMode="tel" required={false} defaultValue={val("phone")} errors={fe?.phone} />
        </div>
      </section>
      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Endereço</h2>
        <Field label="Endereço" name="addressLine" required={false} defaultValue={val("addressLine")} errors={fe?.addressLine} />
        <div className="grid gap-4 sm:grid-cols-[1fr_80px_120px]">
          <Field label="Cidade" name="addressCity" required={false} defaultValue={val("addressCity")} errors={fe?.addressCity} />
          <Field label="UF" name="addressState" required={false} maxLength={2} defaultValue={val("addressState")} errors={fe?.addressState} />
          <Field label="CEP" name="addressZip" required={false} inputMode="numeric" defaultValue={val("addressZip")} errors={fe?.addressZip} />
        </div>
      </section>
      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Contato de emergência</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" name="emergencyContactName" required={false} defaultValue={val("emergencyContactName")} errors={fe?.emergencyContactName} />
          <Field label="Telefone" name="emergencyContactPhone" type="tel" inputMode="tel" required={false} defaultValue={val("emergencyContactPhone")} errors={fe?.emergencyContactPhone} />
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Lembretes</h2>
        <p className="-mt-1 text-sm text-text-muted">Confirmações e avisos de cancelamento sempre chegam; aqui você escolhe os lembretes.</p>
        <Checkbox label="Quero lembretes por WhatsApp" name="prefWhatsapp" defaultChecked={pref("prefWhatsapp", prefs.whatsapp)} />
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <Checkbox label="24 h antes" name="prefReminder24h" defaultChecked={pref("prefReminder24h", prefs.reminder24h)} />
          <Checkbox label="2 h antes" name="prefReminder2h" defaultChecked={pref("prefReminder2h", prefs.reminder2h)} />
        </div>
      </section>
      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
