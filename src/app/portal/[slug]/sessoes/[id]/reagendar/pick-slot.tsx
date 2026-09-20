"use client";

import { useState, useTransition } from "react";
import { rescheduleAppointmentPortalAction } from "../../../actions";

export function PickSlot({ slug, appointmentId, slots }: { slug: string; appointmentId: string; slots: { iso: string; label: string }[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (slots.length === 0) return <p className="text-sm text-text-muted">Nenhum horário livre neste dia.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {slots.map((s) => (
          <button key={s.iso} type="button" onClick={() => setChosen(s.iso)} className={`rounded-lg border py-2 text-center text-sm transition ${chosen === s.iso ? "border-primary bg-primary font-semibold text-white" : "border-border bg-surface hover:border-primary/50"}`}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {chosen && (
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await rescheduleAppointmentPortalAction(slug, appointmentId, chosen);
              if (r?.error) setError(r.error);
            })
          }
        >
          {pending ? "Reagendando…" : `Confirmar ${slots.find((s) => s.iso === chosen)?.label}`}
        </button>
      )}
    </div>
  );
}
