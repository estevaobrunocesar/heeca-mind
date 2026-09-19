"use client";

import { useState, useTransition } from "react";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";

export type SessionRow = { sid: string; device: string; ip: string | null; createdAt: string; lastSeenAt: string; current: boolean };

export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <section className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">Sessões ativas</h2>
          <p className="mt-1 text-sm text-text-muted">Onde sua conta está conectada. Encerrar uma sessão desconecta o dispositivo no próximo acesso.</p>
        </div>
        {others > 0 && (
          <button
            type="button"
            className="btn-ghost shrink-0"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revokeOtherSessionsAction();
                setNotice(`${r.revoked} sessão(ões) encerrada(s).`);
              })
            }
          >
            Sair dos outros dispositivos
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="mt-3 rounded-lg bg-primary-soft px-3 py-2 text-sm text-primary">
          {notice}
        </p>
      )}
      <ul className="mt-3 divide-y divide-border text-sm">
        {sessions.map((s) => (
          <li key={s.sid} className="flex items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">
                {s.device}
                {s.current && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">esta sessão</span>}
              </p>
              <p className="text-xs text-text-muted">
                {s.ip ? `${s.ip} · ` : ""}entrou {s.createdAt} · último uso {s.lastSeenAt}
              </p>
            </div>
            {!s.current && (
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-danger disabled:opacity-40"
                disabled={pending}
                onClick={() => start(() => revokeSessionAction(s.sid).then(() => setNotice("Sessão encerrada.")))}
              >
                Encerrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
