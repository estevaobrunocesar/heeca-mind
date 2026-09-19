"use client";

import { useState, useTransition } from "react";
import { offerCancelledSlotAction } from "../espera/actions";

type Candidate = { id: string; patientName: string; prefs: string; priority: boolean; waitingSince: string };

/**
 * Aparece numa sessão cancelada/expirada no futuro: quem, da lista de
 * espera, combina com o horário que vagou. Um clique oferece (reserva +
 * WhatsApp com link); o resto continua na fila.
 */
export function WaitlistOfferBlock({ appointmentId, candidates, slotLabel }: { appointmentId: string; candidates: Candidate[]; slotLabel: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (candidates.length === 0) return null;
  return (
    <section className="card border-primary/40">
      <h2 className="text-base font-semibold">Horário vagou — {candidates.length === 1 ? "1 pessoa da lista de espera combina" : `${candidates.length} pessoas da lista de espera combinam`}</h2>
      <p className="mt-1 text-sm text-text-muted">{slotLabel}. Ofereça a uma pessoa; o horário fica reservado até ela confirmar pelo WhatsApp.</p>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-primary" : "text-danger"}`}>{msg.text}</p>}
      <ul className="mt-3 divide-y divide-border">
        {candidates.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <div>
              <span className="font-medium">{c.patientName}</span>
              {c.priority && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">prioridade</span>}
              <p className="text-xs text-text-muted">
                {c.prefs} · desde {c.waitingSince}
              </p>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={pending || msg?.ok}
              onClick={() =>
                start(async () => {
                  const r = await offerCancelledSlotAction(c.id, appointmentId);
                  setMsg({ ok: r.ok, text: r.message });
                })
              }
            >
              Oferecer
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
