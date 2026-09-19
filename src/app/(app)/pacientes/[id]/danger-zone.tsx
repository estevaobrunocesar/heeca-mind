"use client";

import { useState, useTransition } from "react";
import { deletePatientAction, restorePatientAction } from "../actions";

export function PatientDangerZone({ id, deleted }: { id: string; deleted: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (deleted) {
    return (
      <section className="card">
        <h2 className="mb-1 text-base font-semibold">Cadastro excluído</h2>
        <p className="mb-3 text-sm text-text-muted">Fora das listas e da busca. O histórico segue preservado pelo prazo de retenção.</p>
        <button type="button" className="btn-ghost w-full" disabled={pending} onClick={() => start(() => restorePatientAction(id))}>
          Restaurar cadastro
        </button>
      </section>
    );
  }

  return (
    <section className="card border-danger/30">
      <h2 className="mb-1 text-base font-semibold">Excluir cadastro</h2>
      <p className="mb-3 text-sm text-text-muted">
        Exclusão lógica (LGPD): o paciente sai das listas, mas o histórico administrativo é mantido pelo prazo de retenção. Sessões futuras precisam ser canceladas antes.
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
