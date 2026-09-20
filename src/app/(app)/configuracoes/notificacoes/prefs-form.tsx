"use client";

import { useActionState, useState } from "react";
import { FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { PRO_EVENT_LABEL, PRO_EVENTS, type ProNotifyPrefs } from "@/lib/pro-notify-prefs";
import { saveNotificationPrefsAction } from "./actions";

export function PrefsForm({ prefs, email }: { prefs: ProNotifyPrefs; email: string }) {
  const [state, action] = useActionState<FormState, FormData>(saveNotificationPrefsAction, {});
  const [enabled, setEnabled] = useState(prefs.enabled);
  return (
    <form action={action} className="card max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold">Avisos por e-mail</h2>
        <p className="mt-1 text-sm text-text-muted">
          Enviados para <strong>{email}</strong>. Os e-mails trazem nome, título e link — nunca conteúdo clínico ou respostas de formulários.
        </p>
      </div>
      {state.ok && <FormSuccess message="Preferências salvas." />}

      <label className="flex items-center gap-3 rounded-lg border border-border p-3">
        <input type="checkbox" name="enabled" className="h-4 w-4" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span className="text-sm font-medium">Receber avisos por e-mail</span>
      </label>

      <fieldset disabled={!enabled} className="space-y-2 disabled:opacity-50">
        {PRO_EVENTS.map((e) => (
          <label key={e} className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-surface-muted">
            <input type="checkbox" name={`event_${e}`} className="mt-1 h-4 w-4" defaultChecked={prefs.events[e]} />
            <span className="text-sm">
              <span className="font-medium">{PRO_EVENT_LABEL[e].title}</span>
              <span className="block text-xs text-text-muted">{PRO_EVENT_LABEL[e].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
