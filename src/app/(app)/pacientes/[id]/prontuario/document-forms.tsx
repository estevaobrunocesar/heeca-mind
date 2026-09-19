"use client";

import { useActionState, useState } from "react";
import type { ClinicalDocumentKind } from "@/generated/prisma/enums";
import { Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import { formatBytes, MAX_DOCUMENT_BYTES } from "@/lib/document";
import type { FormState } from "@/lib/form";
import { deleteClinicalDocumentAction, uploadClinicalDocumentAction } from "./actions";

type SessionOpt = { id: string; label: string };

const KINDS: Array<{ value: ClinicalDocumentKind; label: string }> = [
  { value: "REPORT", label: "Laudo / relatório" },
  { value: "REFERRAL", label: "Encaminhamento" },
  { value: "DECLARATION", label: "Declaração" },
  { value: "CERTIFICATE", label: "Atestado" },
  { value: "CONSENT", label: "Termo de consentimento" },
  { value: "EXAM", label: "Exame / documento externo" },
  { value: "OTHER", label: "Outro" },
];

export function UploadDocumentForm({ patientId, sessions }: { patientId: string; sessions: SessionOpt[] }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(uploadClinicalDocumentAction.bind(null, patientId), {});
  const [fileInfo, setFileInfo] = useState<{ name: string; size: number } | null>(null);
  const fe = state.fieldErrors;
  const tooBig = !!fileInfo && fileInfo.size > MAX_DOCUMENT_BYTES;

  if (!open && !state.ok) {
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        + Anexar documento
      </button>
    );
  }

  return (
    <form action={action} className="card space-y-4" key={state.ok ? "saved" : "editing"} encType="multipart/form-data">
      <div>
        <h3 className="text-base font-semibold">Anexar documento</h3>
        <p className="mt-1 text-sm text-text-muted">PDF, JPG, PNG ou WebP até 8 MB. O arquivo é cifrado antes de ser guardado; só você consegue abri-lo.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Documento anexado." />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="field-doc-kind" className="label">
            Tipo
          </label>
          <select id="field-doc-kind" name="kind" className="input" defaultValue={state.values?.kind ?? "REPORT"} key={state.values?.kind ?? "REPORT"} aria-invalid={!!fe?.kind}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          {fe?.kind && <p className="field-error">{fe.kind[0]}</p>}
        </div>
        <div>
          <label htmlFor="field-doc-appointmentId" className="label">
            Sessão relacionada <span className="font-normal text-text-muted">(opcional)</span>
          </label>
          <select id="field-doc-appointmentId" name="appointmentId" className="input" defaultValue="">
            <option value="">—</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Field label="Título" name="title" placeholder="Ex.: Laudo psicológico — avaliação inicial" defaultValue={state.values?.title} errors={fe?.title} />

      <div>
        <label htmlFor="field-doc-description" className="label">
          Descrição <span className="font-normal text-text-muted">(opcional)</span>
        </label>
        <textarea id="field-doc-description" name="description" rows={2} className="input resize-y" defaultValue={state.values?.description} aria-invalid={!!fe?.description} />
        {fe?.description && <p className="field-error">{fe.description[0]}</p>}
      </div>

      <div>
        <label htmlFor="field-doc-file" className="label">
          Arquivo
        </label>
        <input
          id="field-doc-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary"
          aria-invalid={!!fe?.file || tooBig}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setFileInfo(f ? { name: f.name, size: f.size } : null);
          }}
        />
        {fileInfo && (
          <p className={`mt-1 text-xs ${tooBig ? "text-danger" : "text-text-muted"}`}>
            {fileInfo.name} · {formatBytes(fileInfo.size)}
            {tooBig && " — acima do limite de 8 MB"}
          </p>
        )}
        {fe?.file && <p className="field-error">{fe.file[0]}</p>}
      </div>

      <div className="flex gap-2">
        <div className="w-40">
          <SubmitButton pendingText="Enviando…">Anexar</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function DeleteDocumentForm({ patientId, documentId }: { patientId: string; documentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(deleteClinicalDocumentAction.bind(null, patientId, documentId), {});
  if (!open) {
    return (
      <button type="button" className="text-xs text-text-muted hover:text-danger" onClick={() => setOpen(true)}>
        Excluir
      </button>
    );
  }
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
      <div className="min-w-56 flex-1">
        <Field label="Motivo da exclusão" name="reason" placeholder="Ex.: versão errada do laudo" errors={state.fieldErrors?.reason} />
      </div>
      <FormError message={state.error} />
      <div className="w-32">
        <SubmitButton pendingText="…">Confirmar</SubmitButton>
      </div>
      <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
        Cancelar
      </button>
    </form>
  );
}
