"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Checkbox, Field, FormError, Select, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { FOLLOW_UP_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { parseCommsPrefs } from "@/lib/comms-prefs";
import { createPatientAction, updatePatientAction } from "./actions";

export type PatientFormValues = {
  id: string;
  name: string;
  whatsapp: string;
  email: string | null;
  usualModality: "IN_PERSON" | "ONLINE" | "HYBRID" | null;
  followUpStatus: "ACTIVE" | "PAUSED" | "DISCHARGED" | "INACTIVE";
  preferredPaymentMethod: "PIX" | "CASH" | "CARD" | "TRANSFER" | "INSURANCE" | "OTHER" | null;
  needsReceipt: boolean;
  bestContactTime: string | null;
  adminNotes: string | null;
  // §12 — camada administrativa
  phone: string | null;
  birthDate: string | null; // "YYYY-MM-DD"
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  commsPrefs: unknown;
  tags: string[];
};

const opts = (o: Record<string, string>, empty?: string) => [
  ...(empty ? [{ value: "", label: empty }] : []),
  ...Object.entries(o).map(([value, label]) => ({ value, label })),
];

export function PatientForm({ patient, tagSuggestions = [] }: { patient?: PatientFormValues; tagSuggestions?: string[] }) {
  const action = patient ? updatePatientAction.bind(null, patient.id) : createPatientAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = <K extends keyof PatientFormValues>(k: K) => v?.[k] ?? (patient?.[k] == null ? undefined : String(patient[k]));
  const prefs = parseCommsPrefs(patient?.commsPrefs);
  // Checkbox: após uma falha de validação, o React reseta o form — reaproveita o que foi digitado.
  const pref = (name: "prefWhatsapp" | "prefReminder24h" | "prefReminder2h", saved: boolean) => (v ? v[name] === "on" : patient ? saved : true);

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      <FormError message={state.error} />

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Contato</h2>
        <Field label="Nome" name="name" autoComplete="off" defaultValue={val("name")} errors={fe?.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" placeholder="(11) 99999-0000" defaultValue={val("whatsapp")} errors={fe?.whatsapp} hint="Identifica o paciente: um número por cadastro." />
          <Field label="E-mail" name="email" type="email" required={false} defaultValue={val("email")} errors={fe?.email} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone alternativo" name="phone" type="tel" inputMode="tel" required={false} placeholder="(11) 3333-0000" defaultValue={val("phone")} errors={fe?.phone} />
          <Field label="Data de nascimento" name="birthDate" type="date" required={false} defaultValue={v?.birthDate ?? patient?.birthDate ?? undefined} errors={fe?.birthDate} />
        </div>
        <Field label="Melhor horário para contato" name="bestContactTime" required={false} placeholder="Ex.: manhãs, depois das 18h" defaultValue={val("bestContactTime")} errors={fe?.bestContactTime} />
      </section>

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Endereço</h2>
        <Field label="Endereço" name="addressLine" required={false} placeholder="Rua, número, complemento" defaultValue={val("addressLine")} errors={fe?.addressLine} />
        <div className="grid gap-4 sm:grid-cols-[1fr_80px_120px]">
          <Field label="Cidade" name="addressCity" required={false} defaultValue={val("addressCity")} errors={fe?.addressCity} />
          <Field label="UF" name="addressState" required={false} placeholder="SP" maxLength={2} defaultValue={val("addressState")} errors={fe?.addressState} />
          <Field label="CEP" name="addressZip" required={false} inputMode="numeric" placeholder="00000-000" defaultValue={val("addressZip")} errors={fe?.addressZip} />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Contato de emergência</h2>
        <p className="-mt-2 text-sm text-text-muted">Para quem ligar em caso de necessidade. Dado administrativo, visível à recepção.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" name="emergencyContactName" required={false} defaultValue={val("emergencyContactName")} errors={fe?.emergencyContactName} />
          <Field label="Telefone" name="emergencyContactPhone" type="tel" inputMode="tel" required={false} placeholder="(11) 99999-0000" defaultValue={val("emergencyContactPhone")} errors={fe?.emergencyContactPhone} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Comunicação</h2>
        <p className="-mt-1 text-sm text-text-muted">Confirmações e avisos de cancelamento sempre são enviados; aqui só os lembretes.</p>
        <Checkbox label="Aceita lembretes por WhatsApp" name="prefWhatsapp" defaultChecked={pref("prefWhatsapp", prefs.whatsapp)} />
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          <Checkbox label="Lembrete 24 h antes" name="prefReminder24h" defaultChecked={pref("prefReminder24h", prefs.reminder24h)} />
          <Checkbox label="Lembrete 2 h antes" name="prefReminder2h" defaultChecked={pref("prefReminder2h", prefs.reminder2h)} />
        </div>
      </section>

      <section className="card space-y-4">
        <Field
          label="Etiquetas"
          name="tags"
          required={false}
          list="tag-suggestions"
          placeholder="Ex.: convênio X, indicação, prefere manhã"
          hint="Separe por vírgula. Etiquetas administrativas para filtrar a lista — nunca use para informação clínica."
          defaultValue={v?.tags ?? patient?.tags.join(", ")}
          errors={fe?.tags}
        />
        {tagSuggestions.length > 0 && (
          <datalist id="tag-suggestions">
            {tagSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Acompanhamento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Status" name="followUpStatus" options={opts(FOLLOW_UP_LABEL)} defaultValue={val("followUpStatus") ?? "ACTIVE"} errors={fe?.followUpStatus} />
          <Select
            label="Modalidade habitual"
            name="usualModality"
            options={[
              { value: "", label: "Não definida" },
              { value: "IN_PERSON", label: "Presencial" },
              { value: "ONLINE", label: "Online" },
              { value: "HYBRID", label: "Alterna" },
            ]}
            defaultValue={val("usualModality") ?? ""}
            errors={fe?.usualModality}
          />
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-base font-semibold">Pagamento</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Forma habitual" name="preferredPaymentMethod" options={opts(PAYMENT_METHOD_LABEL, "Não definida")} defaultValue={val("preferredPaymentMethod") ?? ""} errors={fe?.preferredPaymentMethod} />
          <div className="pt-7">
            <Checkbox label="Precisa de recibo" name="needsReceipt" defaultChecked={v ? v.needsReceipt === "on" : (patient?.needsReceipt ?? false)} />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <TextArea
          label="Observações administrativas"
          name="adminNotes"
          rows={4}
          placeholder="Ex.: prefere online; sessões semanais às terças; avisar com 1 dia de antecedência."
          hint="Logística e preferências. Nunca conteúdo clínico — isso fica no prontuário, com acesso restrito."
          defaultValue={val("adminNotes")}
          errors={fe?.adminNotes}
        />
      </section>

      <div className="flex items-center justify-end gap-3">
        <Link href={patient ? `/pacientes/${patient.id}` : "/pacientes"} className="btn-ghost">
          Cancelar
        </Link>
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">{patient ? "Salvar" : "Cadastrar"}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
