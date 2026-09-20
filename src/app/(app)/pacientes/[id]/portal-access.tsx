"use client";

import { useState, useTransition } from "react";
import { revokePortalSessionsAction } from "./portal-actions";

/** Sessões ativas do paciente no portal; a recepção pode encerrar todas (telefone trocado, aparelho perdido). */
export function PortalAccess({ patientId, activeSessions, lastSeen }: { patientId: string; activeSessions: number; lastSeen: string | null }) {
  const [pending, start] = useTransition();
  const [count, setCount] = useState(activeSessions);
  return (
    <section className="card">
      <h2 className="mb-1 text-base font-semibold">Portal do paciente</h2>
      <p className="text-sm text-text-muted">
        {count === 0 ? "Nenhuma sessão ativa no portal." : `${count} sessão(ões) ativa(s)${lastSeen ? ` · último acesso ${lastSeen}` : ""}.`} O acesso é por link no WhatsApp cadastrado.
      </p>
      {count > 0 && (
        <button
          type="button"
          className="btn-ghost mt-3"
          disabled={pending}
          onClick={() => {
            if (!confirm("Encerrar todas as sessões do portal deste paciente? Ele precisará pedir um novo link.")) return;
            start(async () => {
              await revokePortalSessionsAction(patientId);
              setCount(0);
            });
          }}
        >
          Encerrar sessões do portal
        </button>
      )}
    </section>
  );
}
