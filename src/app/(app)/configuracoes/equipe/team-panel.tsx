"use client";

import { useActionState, useState, useTransition } from "react";
import { Field, FormError, FormSuccess, Select, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { ROLE_LABEL } from "@/lib/validation/team";
import { cancelInviteAction, changeRoleAction, inviteMemberAction, removeMemberAction, updateClinicAction } from "./actions";

type Member = { membershipId: string; userId: string; name: string; email: string; role: keyof typeof ROLE_LABEL; hasProfile: boolean; isMe: boolean; lastLoginAt: string | null };
type Invite = { id: string; email: string; role: keyof typeof ROLE_LABEL; expiresAt: string };

export function ClinicForm({ name, slug, publicBaseUrl }: { name: string; slug: string | null; publicBaseUrl: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateClinicAction, {});
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Clínica</h2>
        <p className="mt-1 text-sm text-text-muted">Nome exibido para a equipe e endereço da página pública com todos os profissionais.</p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Dados da clínica salvos." />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da clínica" name="name" defaultValue={state.values?.name ?? name} errors={state.fieldErrors?.name} />
        <div>
          <label htmlFor="field-slug" className="label">
            Página pública
          </label>
          <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="shrink-0 border-r border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">{publicBaseUrl}/clinica/</span>
            <input id="field-slug" name="slug" className="w-full bg-transparent px-3 py-2 text-sm outline-none" defaultValue={state.values?.slug ?? slug ?? ""} placeholder="opcional" />
          </div>
          {state.fieldErrors?.slug && <p className="field-error">{state.fieldErrors.slug[0]}</p>}
        </div>
      </div>
      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}

export function InviteForm() {
  const [state, action] = useActionState<FormState, FormData>(inviteMemberAction, {});
  return (
    <form action={action} className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">Convidar para a equipe</h2>
        <p className="mt-1 text-sm text-text-muted">
          A pessoa recebe um link por e-mail, cria a própria senha e, se for psicólogo(a), preenche CRP e nome profissional. Recepção vê agenda e
          pacientes, mas não valores nem configurações.
        </p>
      </div>
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Convite enviado." />}
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem_8rem]">
        <Field label="E-mail" name="email" type="email" defaultValue={state.values?.email} errors={state.fieldErrors?.email} />
        <Select
          label="Papel"
          name="role"
          options={[
            { value: "PROFESSIONAL", label: ROLE_LABEL.PROFESSIONAL },
            { value: "RECEPTIONIST", label: ROLE_LABEL.RECEPTIONIST },
          ]}
          defaultValue={state.values?.role ?? "PROFESSIONAL"}
          errors={state.fieldErrors?.role}
        />
        <div className="pt-6">
          <SubmitButton pendingText="Enviando…">Convidar</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function TeamList({ members, invites }: { members: Member[]; invites: Invite[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card">
      <h2 className="text-base font-semibold">Equipe</h2>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="mt-3 divide-y divide-border text-sm">
        {members.map((m) => (
          <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div>
              <p className="font-medium">
                {m.name}
                {m.isMe && <span className="ml-2 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">você</span>}
              </p>
              <p className="text-xs text-text-muted">
                {m.email} · {m.lastLoginAt ? `último acesso ${m.lastLoginAt}` : "nunca acessou"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {m.isMe ? (
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">{ROLE_LABEL[m.role]}</span>
              ) : (
                <>
                  <select
                    className="rounded-md border border-border bg-surface px-2 py-1 text-xs"
                    value={m.role}
                    disabled={pending}
                    onChange={(e) => start(() => changeRoleAction(m.membershipId, e.target.value as Member["role"]))}
                    aria-label={`Papel de ${m.name}`}
                  >
                    {m.hasProfile && <option value="PROFESSIONAL">{ROLE_LABEL.PROFESSIONAL}</option>}
                    <option value="RECEPTIONIST">{ROLE_LABEL.RECEPTIONIST}</option>
                    <option value="OWNER">{ROLE_LABEL.OWNER}</option>
                  </select>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-danger disabled:opacity-40"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remover ${m.name} da equipe? A pessoa perde o acesso imediatamente.`)) return;
                      start(async () => {
                        const r = await removeMemberAction(m.membershipId);
                        setError(r.error ?? null);
                      });
                    }}
                  >
                    Remover
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {invites.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-text-muted">Convites pendentes</h3>
          <ul className="mt-2 divide-y divide-border text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {i.email} <span className="text-xs text-text-muted">· {ROLE_LABEL[i.role]} · expira {i.expiresAt}</span>
                </span>
                <button type="button" className="text-xs text-text-muted hover:text-danger disabled:opacity-40" disabled={pending} onClick={() => start(() => cancelInviteAction(i.id))}>
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
