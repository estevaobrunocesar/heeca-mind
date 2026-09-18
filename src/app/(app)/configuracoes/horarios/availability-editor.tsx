"use client";

import { useActionState, useState } from "react";
import { FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { WEEKDAY_LABELS } from "@/lib/time";
import { saveAvailabilityAction } from "../actions";

export type Rule = { weekday: number; startTime: string; endTime: string };

// Ordem de exibição: segunda a domingo, como em agendas brasileiras.
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function AvailabilityEditor({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [state, action] = useActionState<FormState, FormData>(saveAvailabilityAction, {});

  function add(weekday: number) {
    const last = rules.filter((r) => r.weekday === weekday).sort((a, b) => (a.endTime < b.endTime ? -1 : 1)).at(-1);
    // Sugere a faixa seguinte com base na última do dia.
    const start = last ? last.endTime : "09:00";
    const end = last && last.endTime < "17:00" ? "18:00" : "12:00";
    setRules([...rules, { weekday, startTime: start, endTime: end > start ? end : "23:00" }]);
  }

  function update(index: number, patch: Partial<Rule>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function remove(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  function copyToWeekdays(fromWeekday: number) {
    const src = rules.filter((r) => r.weekday === fromWeekday);
    const kept = rules.filter((r) => r.weekday === 0 || r.weekday === 6 || r.weekday === fromWeekday);
    const copies = [1, 2, 3, 4, 5]
      .filter((wd) => wd !== fromWeekday)
      .flatMap((wd) => src.map((r) => ({ ...r, weekday: wd })));
    setRules([...kept, ...copies]);
  }

  return (
    <form action={action} className="card">
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Grade semanal</h2>
          <p className="mt-1 text-sm text-text-muted">
            Os horários em que você atende. Os slots oferecidos ao paciente são calculados a partir daqui.
          </p>
        </div>
      </div>

      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Grade salva." />}

      <ul className="mt-4 divide-y divide-border">
        {DISPLAY_ORDER.map((wd) => {
          const dayRules = rules.map((r, i) => ({ r, i })).filter(({ r }) => r.weekday === wd);
          return (
            <li key={wd} className="grid gap-3 py-3 sm:grid-cols-[8rem_1fr]">
              <div>
                <p className="pt-2 text-sm font-medium">{WEEKDAY_LABELS[wd]}</p>
                <div className="mt-1 flex flex-col items-start">
                  <button
                    type="button"
                    onClick={() => add(wd)}
                    className="rounded-md px-1.5 py-0.5 text-xs text-primary hover:bg-primary-soft"
                  >
                    + faixa
                  </button>
                  {wd >= 1 && wd <= 5 && dayRules.length > 0 && (
                    <button
                      type="button"
                      onClick={() => copyToWeekdays(wd)}
                      className="rounded-md px-1.5 py-0.5 text-xs text-text-muted hover:bg-surface-muted"
                      title="Copiar estes horários para segunda a sexta"
                    >
                      copiar p/ seg–sex
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {dayRules.length === 0 && <p className="pt-2 text-sm text-text-muted">Não atende</p>}
                {dayRules.map(({ r, i }) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      step={300}
                      className="input w-32"
                      value={r.startTime}
                      onChange={(e) => update(i, { startTime: e.target.value })}
                      aria-label={`${WEEKDAY_LABELS[wd]} início`}
                    />
                    <span className="text-text-muted">–</span>
                    <input
                      type="time"
                      step={300}
                      className="input w-32"
                      value={r.endTime}
                      onChange={(e) => update(i, { endTime: e.target.value })}
                      aria-label={`${WEEKDAY_LABELS[wd]} fim`}
                    />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-danger"
                      aria-label="Remover faixa"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex justify-end">
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">Salvar grade</SubmitButton>
        </div>
      </div>
    </form>
  );
}
