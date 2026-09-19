"use client";

import { useState, useTransition } from "react";
import { anonymizePatientNowAction, deletePatientAction, restorePatientAction } from "../actions";

export function PatientDangerZone({
  id,
  deleted,
  anonymized,
  anonymizationDue,
}: {
  id: string;
  deleted: boolean;
  anonymized: boolean;
  /** Data prevista da anonimização automática (pt-BR), se excluído. */
  anonymizationDue: string | null;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (anonymized) {
    return (
      <section className="card">
        <h2 className="mb-1 text-base font-semibold">Cadastro anonimizado</h2>
        <p className="text-sm text-text-muted">
          Dados pessoais removidos de forma irreversível. Sessões e valores permanecem apenas para fins estatísticos e
          financeiros.
        </p>
      </section>
    );
  }

  if (deleted) {
    return (
      <section className="card">
        <h2 className="mb-1 text-base font-semibold">Cadastro excluído</h2>
        <p className="mb-3 text-sm text-text-muted">
          Fora das listas e da busca. O histórico segue preservado pelo prazo de retenção
          {anonymizationDue ? `; anonimização automática prevista para ${anonymizationDue}` : ""}.
        </p>
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <button type="button" className="btn-ghost w-full" disabled={pending} onClick={() => start(() => restorePatientAction(id))}>
            Restaurar cadastro
          </button>
          <button
            type="button"
            className="btn-ghost w-full text-danger hover:bg-danger-soft"
            disabled={pending}
            onClick={() => {
              if (
                !confirm(
                  "Anonimizar AGORA? Nome, contato, observações e notas clínicas serão apagados de forma irreversível. Use apenas a pedido do titular.",
                )
              )
                return;
              start(async () => {
                const r = await anonymizePatientNowAction(id);
                if (r?.error) setError(r.error);
              });
            }}
          >
            Anonimizar agora (pedido do titular)
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="card border-danger/30">
      <h2 className="mb-1 text-base font-semibold">Excluir cadastro</h2>
      <p className="mb-3 text-sm text-text-muted">
        Exclusão lógica (LGPD): o paciente sai das listas, mas o histórico administrativo é mantido pelo prazo de retenção
        e depois anonimizado automaticamente. Sessões futuras precisam ser canceladas antes.
      </p>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn-ghost w-full text-danger hover:bg-danger-soft"
        disabled={pending}
        onClick={() => {
          if (!confirm("Excluir este paciente? Ele sai das listas e da busca.")) return;
          start(async () => {
            const r = await deletePatientAction(id);
            if (r?.error) setError(r.error);
          });
        }}
      >
        Excluir paciente
      </button>
    </section>
  );
}
