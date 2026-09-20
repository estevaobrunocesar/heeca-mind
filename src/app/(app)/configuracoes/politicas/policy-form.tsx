"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormError, FormSuccess, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { updatePolicyAction } from "../actions";

export type PolicyValues = {
  cancellationPolicy: string | null;
  noShowPolicy: string | null;
  reschedulePolicy: string | null;
  confirmationPolicy: string | null;
  onlineInstructions: string | null;
  paymentInfo: string | null;
  terms: string | null;
  noShowConsumesPackage: boolean;
  surveyEnabled: boolean;
  reactivationAfterDays: number;
  reactivationInviteText: string | null;
};

type TextField = Exclude<keyof PolicyValues, "noShowConsumesPackage" | "surveyEnabled" | "reactivationAfterDays" | "reactivationInviteText">;

const FIELDS: Array<{
  name: TextField;
  label: string;
  hint: string;
  placeholder?: string;
  rows?: number;
  isPublic?: boolean;
}> = [
  {
    name: "cancellationPolicy",
    label: "Política de cancelamento",
    hint: "Exibida na página pública e citada nas mensagens de lembrete.",
    placeholder: "Cancelamentos ou reagendamentos devem ser feitos com pelo menos 24 horas de antecedência.",
    isPublic: true,
  },
  { name: "reschedulePolicy", label: "Regras de reagendamento", hint: "Exibida na página pública.", isPublic: true },
  { name: "noShowPolicy", label: "Política de faltas", hint: "Como são tratadas sessões não comparecidas (cobrança, reposição)." },
  { name: "confirmationPolicy", label: "Política de confirmação", hint: "Ex.: sessões não confirmadas até 12h antes são liberadas." },
  {
    name: "onlineInstructions",
    label: "Orientações para atendimento online",
    hint: "Enviadas junto com o link da sessão.",
    placeholder: "Esteja em um ambiente reservado, com fones de ouvido e boa conexão.",
    rows: 4,
  },
  { name: "paymentInfo", label: "Informações sobre pagamento", hint: "Formas aceitas, chave Pix, prazo. Enviadas na confirmação." },
  { name: "terms", label: "Termos administrativos", hint: "Texto livre aceito pelo paciente ao agendar.", rows: 6 },
];

export function PolicyForm({ policy }: { policy: PolicyValues }) {
  const [state, action] = useActionState<FormState, FormData>(updatePolicyAction, {});
  const fe = state.fieldErrors;
  const v = state.values;

  return (
    <form action={action} className="card max-w-3xl space-y-5">
      <div>
        <h2 className="text-base font-semibold">Políticas de atendimento</h2>
        <p className="mt-1 text-sm text-text-muted">Textos administrativos. Nada aqui deve conter informação clínica.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Políticas salvas." />}
      {FIELDS.map((f) => (
        <TextArea
          key={f.name}
          label={f.isPublic ? `${f.label} (pública)` : f.label}
          name={f.name}
          rows={f.rows ?? 3}
          hint={f.hint}
          placeholder={f.placeholder}
          defaultValue={v?.[f.name] ?? policy[f.name]}
          errors={fe?.[f.name]}
        />
      ))}
      <div className="rounded-lg border border-border bg-surface-muted/50 p-3">
        <Checkbox
          label="Falta desconta uma sessão do pacote"
          name="noShowConsumesPackage"
          hint="Quando o paciente tem pacote e não comparece, a sessão é descontada do saldo (a hora foi reservada). Desmarque para não descontar."
          defaultChecked={v ? v.noShowConsumesPackage === "on" : policy.noShowConsumesPackage}
        />
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface-muted/50 p-3">
        <Checkbox label="Enviar pesquisa de experiência após a sessão" name="surveyEnabled" hint="Nota de 0 a 10 e comentário, 24 h depois de cada sessão concluída. Administrativa e privada — não é avaliação clínica nem pública." defaultChecked={v ? v.surveyEnabled === "on" : policy.surveyEnabled} />
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Field label="Reativação após (dias)" name="reactivationAfterDays" type="number" inputMode="numeric" hint="Sem sessão há N dias → aparece na lista de reativação." defaultValue={v?.reactivationAfterDays ?? String(policy.reactivationAfterDays)} errors={fe?.reactivationAfterDays} />
          <Field label="Frase do convite de retorno" name="reactivationInviteText" required={false} placeholder="Faz um tempo desde a sua última sessão. Se quiser retomar, estou por aqui." hint="Vai no meio da mensagem de WhatsApp. Só texto administrativo." defaultValue={v?.reactivationInviteText ?? policy.reactivationInviteText ?? undefined} errors={fe?.reactivationInviteText} />
        </div>
      </div>
      <div className="flex justify-end">
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">Salvar políticas</SubmitButton>
        </div>
      </div>
    </form>
  );
}
