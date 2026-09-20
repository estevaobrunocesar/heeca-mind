"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import { DOCUMENT_KIND_LABEL, DOCUMENT_STATUS_LABEL, type DocumentStatus } from "@/lib/documents/rules";
import type { FormState } from "@/lib/form";
import { revokeDocumentAction, sendDocumentAction } from "./actions";

export type DocumentRow = {
  id: string;
  kind: keyof typeof DOCUMENT_KIND_LABEL;
  title: string;
  version: number;
  status: DocumentStatus;
  sentAt: string;
  acceptedAt: string | null;
  expiresAt: string;
  professional: string;
};

const STATUS_BADGE: Record<DocumentStatus, string> = {
  PENDING: "bg-warning/15 text-warning",
  VIEWED: "bg-warning/15 text-warning",
  ACCEPTED: "bg-primary-soft text-primary",
  EXPIRED: "bg-surface-muted text-text-muted",
  REVOKED: "bg-surface-muted text-text-muted",
};

/**
 * Documentos administrativos do paciente (§15): o que foi enviado, quando, versão e status.
 * Texto aceito e prova do aceite abrem em /pacientes/[id]/documentos/[requestId].
 */
export function DocumentsPanel({ patientId, rows, templates, canSend, appointmentId }: { patientId: string; rows: DocumentRow[]; templates: { id: string; title: string; kind: keyof typeof DOCUMENT_KIND_LABEL; version: number }[]; canSend: boolean; appointmentId?: string }) {
  const [state, action] = useActionState<FormState, FormData>(sendDocumentAction.bind(null, patientId), {});
  const [pending, start] = useTransition();
  return (
    <section className="card">
      <h2 className="mb-1 text-base font-semibold">Documentos</h2>
      <p className="mb-3 text-sm text-text-muted">Termos, contratos e políticas enviados por WhatsApp para leitura e aceite.</p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">Nenhum documento enviado.</p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <Link href={`/pacientes/${patientId}/documentos/${r.id}`} className="font-medium hover:text-primary hover:underline">
                  {r.title}
                </Link>
                <p className="text-xs text-text-muted">
                  {DOCUMENT_KIND_LABEL[r.kind]} · v{r.version} · enviado {new Date(r.sentAt).toLocaleDateString("pt-BR")}
                  {r.acceptedAt ? ` · aceito ${new Date(r.acceptedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : r.status === "PENDING" || r.status === "VIEWED" ? ` · vence ${new Date(r.expiresAt).toLocaleDateString("pt-BR")}` : ""}
                  {" · "}
                  {r.professional}
                </p>
                {canSend && (r.status === "PENDING" || r.status === "VIEWED") && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-text-muted hover:text-danger"
                    disabled={pending}
                    onClick={() => {
                      const reason = prompt("Motivo do cancelamento (opcional):") ?? "";
                      start(() => revokeDocumentAction(r.id, patientId, reason));
                    }}
                  >
                    Cancelar envio
                  </button>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[r.status]}`}>{DOCUMENT_STATUS_LABEL[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
      {canSend && templates.length > 0 && (
        <form action={action} className="mt-4 space-y-2 border-t border-border pt-3">
          <FormError message={state.ok ? undefined : state.error} />
          {state.ok && <FormSuccess message={state.error ?? "Documento enviado por WhatsApp."} />}
          {appointmentId && <input type="hidden" name="appointmentId" value={appointmentId} />}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select label="Enviar documento" name="templateId" options={templates.map((t) => ({ value: t.id, label: `${t.title} (v${t.version})` }))} defaultValue={templates[0]?.id} />
            </div>
            <div className="w-28">
              <SubmitButton pendingText="Enviando…">Enviar</SubmitButton>
            </div>
          </div>
          <p className="text-xs text-text-muted">Reenviar um documento em aberto gera um link novo e invalida o anterior.</p>
        </form>
      )}
      {canSend && templates.length === 0 && (
        <p className="mt-3 text-xs text-text-muted">
          Nenhum modelo ativo.{" "}
          <Link href="/configuracoes/documentos" className="text-primary hover:underline">
            Criar modelos
          </Link>
        </p>
      )}
    </section>
  );
}
