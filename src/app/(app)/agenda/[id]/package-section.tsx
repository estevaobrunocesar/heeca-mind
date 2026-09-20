"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Field, FormError, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { linkAppointmentToPackageAction, revertConsumptionAction, unlinkAppointmentFromPackageAction } from "../../pacotes/actions";

type Candidate = { id: string; name: string; balance: number; expiresAt: string };
type Linked = { id: string; name: string; balance: number; consumed: { reason: string; consumedAt: string } | null };

function RevertForm({ appointmentId, onDone }: { appointmentId: string; onDone: () => void }) {
  const [state, action] = useActionState<FormState, FormData>(revertConsumptionAction.bind(null, appointmentId), {});
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);
  return (
    <form action={action} className="mt-2 space-y-2">
      <FormError message={state.error} />
      <Field label="Motivo" name="reason" placeholder="Ex.: marquei falta por engano" defaultValue={state.values?.reason} errors={state.fieldErrors?.reason} />
      <div className="flex gap-2">
        <div className="w-32">
          <SubmitButton pendingText="Revertendo…">Reverter</SubmitButton>
        </div>
        <button type="button" className="btn-ghost" onClick={onDone}>
          Voltar
        </button>
      </div>
    </form>
  );
}

/**
 * Sessão × pacote (§20). Vincular deixa a sessão "coberta" (não entra em a receber);
 * o consumo só acontece ao concluir ou faltar (D2), e pode ser revertido com motivo.
 */
export function PackageSection({ appointmentId, linked, candidates, canManage, tz }: { appointmentId: string; linked: Linked | null; candidates: Candidate[]; canManage: boolean; tz: string }) {
  const [pending, start] = useTransition();
  const [reverting, setReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir.");
      }
    });
  if (!linked && candidates.length === 0) return null;

  return (
    <section className="card">
      <h2 className="mb-2 text-base font-semibold">Pacote</h2>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      {linked ? (
        <>
          <p className="text-sm">
            Coberta pelo pacote <strong>{linked.name}</strong> · {linked.balance} sessão(ões) restante(s).
          </p>
          {linked.consumed ? (
            <p className="mt-1 text-xs text-text-muted">
              Consumiu 1 sessão em {new Date(linked.consumed.consumedAt).toLocaleDateString("pt-BR", { timeZone: tz })} ({linked.consumed.reason === "no_show" ? "falta" : "sessão concluída"}).
            </p>
          ) : (
            <p className="mt-1 text-xs text-text-muted">Ainda não consumiu: desconta ao concluir (ou ao marcar falta, conforme sua política).</p>
          )}
          {canManage && !reverting && (
            <div className="mt-3 flex gap-3 text-xs">
              {linked.consumed ? (
                <button type="button" className="text-text-muted hover:text-danger" onClick={() => setReverting(true)}>
                  Reverter consumo
                </button>
              ) : (
                <button type="button" className="text-text-muted hover:text-danger" disabled={pending} onClick={() => run(() => unlinkAppointmentFromPackageAction(appointmentId))}>
                  Desvincular do pacote
                </button>
              )}
            </div>
          )}
          {reverting && <RevertForm appointmentId={appointmentId} onDone={() => setReverting(false)} />}
        </>
      ) : (
        <>
          <p className="text-sm text-text-muted">O paciente tem pacote ativo que cobre esta sessão.</p>
          {canManage && (
            <ul className="mt-2 space-y-2">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {c.name} · {c.balance} restante(s) · vence {new Date(c.expiresAt).toLocaleDateString("pt-BR", { timeZone: tz })}
                  </span>
                  <button type="button" className="btn-ghost h-8 px-3 py-0 text-xs" disabled={pending} onClick={() => run(() => linkAppointmentToPackageAction(appointmentId, c.id))}>
                    Usar pacote
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
