"use client";

import { useState, useTransition } from "react";
import { cancelByTokenAction, confirmByTokenAction } from "./actions";

export function ConfirmButtons({ token, canConfirm, canCancel }: { token: string; canConfirm: boolean; canCancel: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  if (result) {
    return (
      <div
        role="status"
        className={`rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-primary-soft text-primary" : "bg-danger-soft text-danger"}`}
      >
        {result.message}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {canConfirm && (
        <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => start(async () => setResult(await confirmByTokenAction(token)))}>
          {pending ? "Confirmando…" : "Confirmar meu horário"}
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          className="btn-ghost w-full text-text-muted"
          disabled={pending}
          onClick={() => {
            if (!confirm("Cancelar este agendamento?")) return;
            start(async () => setResult(await cancelByTokenAction(token)));
          }}
        >
          Não vou poder comparecer
        </button>
      )}
    </div>
  );
}
