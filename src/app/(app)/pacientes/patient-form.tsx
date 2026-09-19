"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Checkbox, Field, FormError, Select, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { FOLLOW_UP_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
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
};

const opts = (o: Record<string, string>, empty?: string) => [
  ...(empty ? [{ value: "", label: empty }] : []),
  ...Object.entries(o).map(([value, label]) => ({ value, label })),
];

export function PatientForm({ patient }: { patient?: PatientFormValues }) {
  const action = patient ? updatePatientAction.bind(null, patient.id) : createPatientAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = <K extends keyof PatientFormValues>(k: K) => v?.[k] ?? (patient?.[k] == null ? undefined : String(patient[k]));

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
        <Field label="Melhor horário para contato" name="bestContactTime" required={false} placeholder="Ex.: manhãs, depois das 18h" defaultValue={val("bestContactTime")} errors={fe?.bestContactTime} />
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
