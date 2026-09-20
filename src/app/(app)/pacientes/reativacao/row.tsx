"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { sendReactivationAction } from "./actions";

export function ReactivationRow({ professionalId, patientId, name, last, lastContact }: { professionalId: string; patientId: string; name: string; last: string; lastContact: string | null }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div>
        <Link href={`/pacientes/${patientId}`} className="font-medium hover:text-primary hover:underline">
          {name}
        </Link>
        <p className="text-xs text-text-muted">
          Última sessão: {last}
          {lastContact && ` · último convite: ${lastContact}`}
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      {done ? (
        <span className="text-xs text-success">Convite enviado</span>
      ) : (
        <button
          type="button"
          className="btn-ghost h-8 px-3 py-0 text-xs"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await sendReactivationAction(professionalId, patientId);
              if (r?.error) setError(r.error);
              else setDone(true);
            })
          }
        >
          {pending ? "Enviando…" : "Enviar convite"}
        </button>
      )}
    </li>
  );
}
