"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Checkbox, Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import { DOCUMENT_KIND_LABEL, DOCUMENT_VARIABLES } from "@/lib/documents/rules";
import type { FormState } from "@/lib/form";
import { installDefaultDocumentsAction, saveDocumentTemplateAction, toggleDocumentTemplateAction } from "./actions";

export type TemplateRow = {
  id: string;
  kind: keyof typeof DOCUMENT_KIND_LABEL;
  title: string;
  body: string;
  version: number;
  requireBeforeFirstSession: boolean;
  isActive: boolean;
  sent: number;
  accepted: number;
};

const KIND_OPTIONS = Object.entries(DOCUMENT_KIND_LABEL).map(([value, label]) => ({ value, label }));

function Editor({ row, onDone }: { row: TemplateRow | null; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(saveDocumentTemplateAction.bind(null, row?.id ?? null), {});
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  const fe = state.fieldErrors;
  const v = state.values;

  // Insere a variável no cursor do textarea (o texto é não-controlado: React reseta após a action).
  const insert = (key: string) => {
    const el = ref.current;
    if (!el) return;
    const token = `{{${key}}}`;
    const s = el.selectionStart ?? el.value.length;
    const e = el.selectionEnd ?? s;
    el.value = el.value.slice(0, s) + token + el.value.slice(e);
    el.selectionStart = el.selectionEnd = s + token.length;
    el.focus();
  };

  return (
    <form action={action} className="card space-y-4">
      <FormError message={state.error} />
      <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
        <Field label="Título" name="title" defaultValue={v?.title ?? row?.title} errors={fe?.title} />
        <Select label="Tipo" name="kind" options={KIND_OPTIONS} defaultValue={v?.kind ?? row?.kind ?? "CONSENT"} errors={fe?.kind} />
      </div>
      <div>
        <label htmlFor="field-body" className="label">
          Texto
        </label>
        <div className="mb-2 flex flex-wrap gap-1">
          {Object.entries(DOCUMENT_VARIABLES).map(([key, hint]) => (
            <button key={key} type="button" title={hint} onClick={() => insert(key)} className="rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-primary hover:bg-primary-soft">
              {`{{${key}}}`}
            </button>
          ))}
        </div>
        <textarea id="field-body" ref={ref} name="body" rows={16} className="input font-mono text-xs leading-relaxed" defaultValue={v?.body ?? row?.body} aria-invalid={!!fe?.body} />
        {fe?.body ? <p className="field-error">{fe.body[0]}</p> : <p className="mt-1 text-xs text-text-muted">As variáveis são preenchidas no envio. Mudar título ou texto cria uma nova versão; o que já foi aceito não muda.</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Checkbox label="Exigir antes da 1ª sessão" name="requireBeforeFirstSession" hint="Enviado automaticamente quando a primeira sessão do paciente for confirmada." defaultChecked={v ? v.requireBeforeFirstSession === "on" : (row?.requireBeforeFirstSession ?? false)} />
        <Checkbox label="Ativo" name="isActive" defaultChecked={v ? v.isActive === "on" : (row?.isActive ?? true)} />
      </div>
      <div className="flex gap-2">
        <div className="w-40">
          <SubmitButton pendingText="Salvando…">{row ? "Salvar" : "Criar modelo"}</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancelar
        </button>
      </div>
      {state.ok && <FormSuccess message="Modelo salvo." />}
    </form>
  );
}

export function TemplateList({ rows }: { rows: TemplateRow[] }) {
  const [editing, setEditing] = useState<string | null | "new">(null);
  const [pending, start] = useTransition();
  const close = () => setEditing(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Modelos</h2>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" disabled={pending} onClick={() => start(() => installDefaultDocumentsAction())}>
            Instalar modelos iniciais
          </button>
          <button type="button" className="btn-primary" onClick={() => setEditing("new")}>
            Novo modelo
          </button>
        </div>
      </div>
      {editing === "new" && <Editor row={null} onDone={close} />}
      {rows.length === 0 && editing !== "new" && <p className="text-sm text-text-muted">Nenhum modelo ainda. Instale os iniciais (termo de consentimento, contrato, política de faltas) e edite como quiser.</p>}
      <ul className="space-y-3">
        {rows.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <Editor row={r} onDone={close} />
            </li>
          ) : (
            <li key={r.id} className={`card flex items-start justify-between gap-4 p-4 ${r.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{r.title}</p>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">{DOCUMENT_KIND_LABEL[r.kind]}</span>
                  <span className="text-xs text-text-muted">v{r.version}</span>
                  {r.requireBeforeFirstSession && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">1ª sessão</span>}
                  {!r.isActive && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-muted">Inativo</span>}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-text-muted">{r.body}</p>
                <p className="mt-2 text-xs text-text-muted">
                  {r.sent} enviado(s) · {r.accepted} aceito(s)
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-text" disabled={pending} onClick={() => start(() => toggleDocumentTemplateAction(r.id))}>
                  {r.isActive ? "Desativar" : "Ativar"}
                </button>
                <button type="button" className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-text" onClick={() => setEditing(r.id)}>
                  Editar
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
