"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton, TextArea } from "@/components/ui/form";
import { answerSurveyAction, type SurveyState } from "./actions";

export function SurveyForm({ token }: { token: string }) {
  const [state, action] = useActionState<SurveyState, FormData>(answerSurveyAction.bind(null, token), {});
  const [score, setScore] = useState<number | null>(null);
  return (
    <form action={action} className="card space-y-5">
      <FormError message={state.error} />
      <div>
        <p className="label">De 0 a 10, quanto você recomendaria este atendimento?</p>
        <div className="grid grid-cols-11 gap-1">
          {Array.from({ length: 11 }, (_, i) => (
            <button key={i} type="button" onClick={() => setScore(i)} className={`rounded-md border py-2 text-sm transition ${score === i ? "border-primary bg-primary font-semibold text-white" : "border-border bg-surface hover:border-primary/50"}`} aria-pressed={score === i}>
              {i}
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-text-muted">
          <span>Não recomendaria</span>
          <span>Com certeza</span>
        </div>
        <input type="hidden" name="score" value={score ?? ""} />
      </div>
      <TextArea label="Quer contar mais? (opcional)" name="comment" rows={3} placeholder="O que foi bem, o que pode melhorar." hint="Só sobre o serviço. Não escreva aqui o que é do seu acompanhamento." />
      <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
    </form>
  );
}
