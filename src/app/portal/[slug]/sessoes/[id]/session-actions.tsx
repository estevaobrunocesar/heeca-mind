"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelAppointmentPortalAction } from "../../actions";

export function SessionActions({ slug, appointmentId, canReschedule, canCancel, blockedReason }: { slug: string; appointmentId: string; canReschedule: boolean; canCancel: boolean; blockedReason?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="mt-3 space-y-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {canReschedule && (
          <Link href={`/portal/${slug}/sessoes/${appointmentId}/reagendar`} className="btn-primary">
            Escolher outro horário
          </Link>
        )}
        {canCancel && !confirming && (
          <button type="button" className="btn-ghost" onClick={() => setConfirming(true)}>
            Cancelar sessão
          </button>
        )}
      </div>
      {confirming && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-3 text-sm">
          <p>Tem certeza? O horário será liberado e o profissional avisado.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await cancelAppointmentPortalAction(slug, appointmentId);
                  if (r?.error) setError(r.error);
                })
              }
            >
              {pending ? "Cancelando…" : "Sim, cancelar"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)}>
              Voltar
            </button>
          </div>
        </div>
      )}
      {!canReschedule && !canCancel && blockedReason && <p className="text-sm text-text-muted">{blockedReason}</p>}
    </div>
  );
}
