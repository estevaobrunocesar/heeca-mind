"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/ui/form";
import type { FormField } from "@/lib/forms-schema";
import { submitFormAction, type SubmitState } from "./actions";

/** Renderiza o snapshot de campos como formulário. Sem estado além do useActionState. */
export function PublicFormFields({ token, fields }: { token: string; fields: FormField[] }) {
  const [state, action] = useActionState<SubmitState, FormData>(submitFormAction.bind(null, token), {});
  const v = state.values ?? {};
  const one = (id: string) => {
    const x = v[id];
    return Array.isArray(x) ? x[0] : x;
  };
  const many = (id: string) => {
    const x = v[id];
    return Array.isArray(x) ? x : x ? [x] : [];
  };

  if (state.ok) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">✓</div>
        <h2 className="text-lg font-semibold">Respostas enviadas</h2>
        <p className="mt-2 text-sm text-text-muted">Obrigado. Você já pode fechar esta página.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      {fields.map((f, i) => {
        const err = state.fieldErrors?.[f.id];
        const id = `f-${f.id}`;
        const label = (
          <label htmlFor={id} className="label">
            {f.label}
            {f.required && <span className="text-danger"> *</span>}
          </label>
        );
        const help = f.help && <p className="mt-1 text-xs text-text-muted">{f.help}</p>;
        const error = err && <p className="field-error">{err}</p>;

        if (f.type === "info") {
          return (
            <div key={f.id} className="rounded-lg bg-surface-muted p-3 text-sm leading-relaxed">
              {f.label}
            </div>
          );
        }
        return (
          <div key={f.id} className="card p-4">
            {f.type === "short_text" && (
              <>
                {label}
                <input id={id} name={f.id} className="input" defaultValue={one(f.id)} maxLength={300} aria-invalid={!!err} />
              </>
            )}
            {f.type === "long_text" && (
              <>
                {label}
                <textarea id={id} name={f.id} rows={4} className="input resize-y" defaultValue={one(f.id)} maxLength={4000} aria-invalid={!!err} />
              </>
            )}
            {f.type === "date" && (
              <>
                {label}
                <input id={id} name={f.id} type="date" className="input" defaultValue={one(f.id)} aria-invalid={!!err} />
              </>
            )}
            {f.type === "yes_no" && (
              <fieldset>
                <legend className="label">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </legend>
                <div className="flex gap-2">
                  {[
                    ["yes", "Sim"],
                    ["no", "Não"],
                  ].map(([val, txt]) => (
                    <label key={val} className="cursor-pointer rounded-lg border border-border px-4 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary">
                      <input type="radio" name={f.id} value={val} className="sr-only" defaultChecked={one(f.id) === val} />
                      {txt}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {f.type === "single_choice" && (
              <fieldset>
                <legend className="label">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </legend>
                <div className="space-y-1.5">
                  {f.options?.map((o) => (
                    <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="radio" name={f.id} value={o} className="accent-primary" defaultChecked={one(f.id) === o} /> {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {f.type === "multi_choice" && (
              <fieldset>
                <legend className="label">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </legend>
                <div className="space-y-1.5">
                  {f.options?.map((o) => (
                    <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input type="checkbox" name={f.id} value={o} className="accent-primary" defaultChecked={many(f.id).includes(o)} /> {o}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {f.type === "scale" && (
              <fieldset>
                <legend className="label">
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </legend>
                <div className="grid grid-cols-11 gap-1">
                  {Array.from({ length: 11 }, (_, n) => (
                    <label key={n} className="cursor-pointer rounded-md border border-border py-2 text-center text-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-white">
                      <input type="radio" name={f.id} value={n} className="sr-only" defaultChecked={one(f.id) === String(n)} />
                      {n}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {help}
            {error}
            <p className="sr-only">Pergunta {i + 1}</p>
          </div>
        );
      })}
      <SubmitButton pendingText="Enviando…">Enviar respostas</SubmitButton>
      <p className="text-center text-xs text-text-muted">Este link é de uso único. Depois de enviar, não é possível alterar as respostas.</p>
    </form>
  );
}
