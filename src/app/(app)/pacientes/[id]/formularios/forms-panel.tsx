"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelFormRequestAction, sendFormAction } from "./actions";

export type RequestRow = {
  id: string;
  title: string;
  dataClass: "CLINICAL" | "ADMINISTRATIVE";
  status: "PENDING" | "SUBMITTED" | "EXPIRED" | "CANCELLED";
  sentAt: string;
  submittedAt: string | null;
  canRead: boolean;
};
type TemplateOpt = { id: string; title: string; dataClass: "CLINICAL" | "ADMINISTRATIVE" };

const STATUS_LABEL = { PENDING: "aguardando", SUBMITTED: "respondido", EXPIRED: "expirado", CANCELLED: "cancelado" } as const;
const STATUS_CLASS = { PENDING: "bg-warning/15 text-warning", SUBMITTED: "bg-primary-soft text-primary", EXPIRED: "bg-surface-muted text-text-muted", CANCELLED: "bg-surface-muted text-text-muted" } as const;

/**
 * Bloco reutilizado na ficha do paciente e no detalhe da sessão: pedidos já
 * feitos + enviar um modelo. `canSend` = quem gerencia a agenda do profissional.
 */
export function FormsPanel({ patientId, appointmentId, requests, templates, canSend, compact = false }: { patientId: string; appointmentId: string | null; requests: RequestRow[]; templates: TemplateOpt[]; canSend: boolean; compact?: boolean }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="card">
      <h2 className="text-base font-semibold">Formulários</h2>
      {!compact && <p className="mt-1 text-xs text-text-muted">Fichas, termos e questionários enviados por WhatsApp. Respostas clínicas abrem só no prontuário.</p>}

      {requests.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nenhum formulário enviado.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border text-sm">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.title}</p>
                <p className="text-xs text-text-muted">
                  enviado {r.sentAt}
                  {r.submittedAt && <> · respondido {r.submittedAt}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                {r.canRead && (
                  <Link href={`/pacientes/${patientId}/formularios/${r.id}`} className="text-xs font-medium text-primary hover:underline">
                    Ver respostas
                  </Link>
                )}
                {r.status === "SUBMITTED" && !r.canRead && <span className="text-xs text-text-muted">{r.dataClass === "CLINICAL" ? "sigilo" : ""}</span>}
                {canSend && r.status === "PENDING" && (
                  <button
                    type="button"
                    className="text-xs text-text-muted hover:text-danger"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const res = await cancelFormRequestAction(patientId, r.id);
                        setMsg({ ok: res.ok, text: res.message });
                      })
                    }
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canSend && templates.length > 0 && (
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <div className="min-w-56 flex-1">
            <label htmlFor="send-template" className="label">
              Enviar formulário
            </label>
            <select id="send-template" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} {t.dataClass === "CLINICAL" ? "(clínico)" : "(termo)"}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !templateId}
            onClick={() =>
              start(async () => {
                const res = await sendFormAction(patientId, templateId, appointmentId);
                setMsg({ ok: res.ok, text: res.message });
              })
            }
          >
            Enviar
          </button>
          {msg && <p className={`basis-full text-xs ${msg.ok ? "text-primary" : "text-danger"}`}>{msg.text}</p>}
        </div>
      )}
      {canSend && templates.length === 0 && (
        <p className="mt-3 text-xs text-text-muted">
          Nenhum modelo ativo.{" "}
          <Link href="/configuracoes/formularios" className="text-primary hover:underline">
            Criar em Configurações → Formulários
          </Link>
          .
        </p>
      )}
    </section>
  );
}
