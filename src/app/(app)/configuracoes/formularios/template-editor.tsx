"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { FIELD_TYPE_LABEL, FIELD_TYPES, type FieldType, type FormField } from "@/lib/forms-schema";
import { installStartersAction, saveTemplateAction, toggleTemplateAction } from "./actions";

export type TemplateRow = {
  id: string;
  title: string;
  description: string | null;
  kind: "INTAKE" | "CONSENT" | "QUESTIONNAIRE" | "CUSTOM";
  dataClass: "CLINICAL" | "ADMINISTRATIVE";
  fields: FormField[];
  autoSendOnFirstSession: boolean;
  isActive: boolean;
  sent: number;
  submitted: number;
};

const KIND_OPTS = [
  { value: "INTAKE", label: "Ficha inicial" },
  { value: "CONSENT", label: "Termo de consentimento" },
  { value: "QUESTIONNAIRE", label: "Questionário" },
  { value: "CUSTOM", label: "Personalizado" },
];

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 36) || "campo"
  );
}

export function TemplateList({ rows }: { rows: TemplateRow[] }) {
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh(); });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
          + Novo modelo
        </button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => installStartersAction())}>
          Instalar modelos iniciais (ficha, termo online, check-in)
        </button>
      </div>

      {editing && <TemplateForm key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}

      {rows.length === 0 ? (
        <p className="card text-sm text-text-muted">Nenhum modelo ainda. Instale os iniciais ou crie o seu.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className={`card ${t.isActive ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    {t.title}
                    <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">{KIND_OPTS.find((k) => k.value === t.kind)?.label}</span>
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${t.dataClass === "CLINICAL" ? "bg-primary-soft text-primary" : "bg-surface-muted text-text-muted"}`}>
                      {t.dataClass === "CLINICAL" ? "clínico · cifrado" : "administrativo"}
                    </span>
                    {t.autoSendOnFirstSession && <span className="ml-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">auto na 1ª sessão</span>}
                  </p>
                  <p className="text-xs text-text-muted">
                    {t.fields.length} campo(s) · {t.sent} enviado(s) · {t.submitted} respondido(s)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <button type="button" className="text-primary hover:underline" onClick={() => setEditing(t)}>
                    Editar
                  </button>
                  <button type="button" className="text-text-muted hover:text-text" disabled={pending} onClick={() => run(() => toggleTemplateAction(t.id, !t.isActive))}>
                    {t.isActive ? "Desativar" : "Ativar"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Draft = FormField & { optionsText?: string };

function TemplateForm({ template, onClose }: { template: TemplateRow | null; onClose: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveTemplateAction.bind(null, template?.id ?? null), {});
  const [fields, setFields] = useState<Draft[]>(template?.fields.map((f) => ({ ...f, optionsText: f.options?.join("\n") })) ?? []);
  const fe = state.fieldErrors;

  const update = (i: number, patch: Partial<Draft>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const add = () => setFields((fs) => [...fs, { id: `campo_${fs.length + 1}`, type: "short_text", label: "", required: false }]);

  const serialized = JSON.stringify(
    fields.map(({ optionsText, ...f }) => {
      const needsOptions = f.type === "single_choice" || f.type === "multi_choice";
      const options = needsOptions ? (optionsText ?? "").split("\n").map((s) => s.trim()).filter(Boolean) : undefined;
      return { ...f, id: f.id || slug(f.label), options };
    }),
  );

  return (
    <form action={action} className="card space-y-4 border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{template ? "Editar modelo" : "Novo modelo"}</h2>
          <p className="mt-1 text-sm text-text-muted">Pedidos já enviados guardam a versão que o paciente recebeu; editar aqui só afeta envios futuros.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Modelo salvo." />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Título" name="title" defaultValue={state.values?.title ?? template?.title} errors={fe?.title} />
        <Select label="Tipo" name="kind" options={KIND_OPTS} defaultValue={state.values?.kind ?? template?.kind ?? "CUSTOM"} errors={fe?.kind} />
        <div className="sm:col-span-2">
          <TextArea label="Instruções ao paciente (opcional)" name="description" rows={2} defaultValue={state.values?.description ?? template?.description ?? ""} errors={fe?.description} />
        </div>
        <Select
          label="Classe do dado"
          name="dataClass"
          options={[
            { value: "CLINICAL", label: "Clínico — cifrado, só o profissional responsável lê" },
            { value: "ADMINISTRATIVE", label: "Administrativo — termos/aceites, visível a quem gerencia a agenda" },
          ]}
          defaultValue={state.values?.dataClass ?? template?.dataClass ?? "CLINICAL"}
          hint="Respostas sobre a pessoa (motivo, histórico, sintomas) são clínicas."
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" name="autoSendOnFirstSession" className="h-4 w-4" defaultChecked={template?.autoSendOnFirstSession ?? false} />
          Enviar automaticamente ao confirmar a primeira sessão
        </label>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="label mb-0">Campos</p>
          <button type="button" className="btn-ghost text-xs" onClick={add}>
            + Campo
          </button>
        </div>
        {fe?.fields && <p className="field-error mb-2">{fe.fields.join(" · ")}</p>}
        <ol className="space-y-2">
          {fields.map((f, i) => {
            const needsOptions = f.type === "single_choice" || f.type === "multi_choice";
            return (
              <li key={i} className="rounded-lg border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
                  <input
                    className="input"
                    placeholder={f.type === "info" ? "Texto exibido ao paciente" : "Pergunta"}
                    value={f.label}
                    onChange={(e) => update(i, { label: e.target.value, id: template ? f.id : slug(e.target.value) || f.id })}
                  />
                  <select className="input" value={f.type} onChange={(e) => update(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {FIELD_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    {f.type !== "info" && (
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} /> obrig.
                      </label>
                    )}
                    <button type="button" onClick={() => move(i, -1)} aria-label="Subir">
                      ↑
                    </button>
                    <button type="button" onClick={() => move(i, 1)} aria-label="Descer">
                      ↓
                    </button>
                    <button type="button" className="text-danger" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} aria-label="Remover">
                      ✕
                    </button>
                  </div>
                </div>
                {needsOptions && (
                  <textarea className="input mt-2 text-sm" rows={3} placeholder="Uma opção por linha" value={f.optionsText ?? ""} onChange={(e) => update(i, { optionsText: e.target.value })} />
                )}
                {f.type !== "info" && (
                  <input className="input mt-2 text-xs" placeholder="Ajuda (opcional)" value={f.help ?? ""} onChange={(e) => update(i, { help: e.target.value || undefined })} />
                )}
              </li>
            );
          })}
        </ol>
        {fields.length === 0 && <p className="text-sm text-text-muted">Nenhum campo. Clique em “+ Campo”.</p>}
      </div>

      <input type="hidden" name="fieldsJson" value={serialized} />
      <div className="w-44">
        <SubmitButton pendingText="Salvando…">Salvar modelo</SubmitButton>
      </div>
    </form>
  );
}
