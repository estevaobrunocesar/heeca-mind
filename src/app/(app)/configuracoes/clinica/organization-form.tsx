"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormError, FormSuccess, SubmitButton } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { formatDocument } from "@/lib/br-document";
import { updateOrganizationAction } from "./actions";

export type OrganizationValues = {
  name: string;
  slug: string | null;
  type: "SOLO" | "CLINIC";
  legalName: string | null;
  document: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  contactEmail: string | null;
  website: string | null;
  instagram: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  offersOnline: boolean;
  offersInPerson: boolean;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function OrganizationForm({ org, publicBaseUrl }: { org: OrganizationValues; publicBaseUrl: string }) {
  const [state, action] = useActionState<FormState, FormData>(updateOrganizationAction, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = <K extends keyof OrganizationValues>(k: K): string | undefined => v?.[k] ?? (org[k] == null ? undefined : String(org[k]));
  const checked = (k: "offersOnline" | "offersInPerson") => (v ? v[k] === "on" : org[k]);
  const who = org.type === "CLINIC" ? "da clínica" : "do consultório";

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Dados salvos." />}

      <Section title={`Identificação ${who}`} hint="Aparece em recibos, documentos e na página pública. A assinatura continua no portal Heeca.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome" name="name" defaultValue={val("name")} errors={fe?.name} />
          <Field label="Razão social" name="legalName" required={false} defaultValue={val("legalName")} errors={fe?.legalName} />
          <Field label="CPF/CNPJ" name="document" required={false} inputMode="numeric" defaultValue={v?.document ?? formatDocument(org.document)} errors={fe?.document} />
          <div>
            <label htmlFor="field-slug" className="label">
              Página pública da clínica
            </label>
            <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="shrink-0 border-r border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">{publicBaseUrl}/clinica/</span>
              <input id="field-slug" name="slug" className="w-full bg-transparent px-3 py-2 text-sm outline-none" defaultValue={val("slug") ?? ""} placeholder="opcional" />
            </div>
            {fe?.slug && <p className="field-error">{fe.slug[0]}</p>}
          </div>
        </div>
      </Section>

      <Section title="Contato">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone" name="contactPhone" type="tel" inputMode="tel" required={false} placeholder="(11) 3333-0000" defaultValue={val("contactPhone")} errors={fe?.contactPhone} />
          <Field label="WhatsApp" name="whatsapp" type="tel" inputMode="tel" required={false} placeholder="(11) 99999-0000" defaultValue={val("whatsapp")} errors={fe?.whatsapp} />
          <Field label="E-mail" name="contactEmail" type="email" required={false} defaultValue={val("contactEmail")} errors={fe?.contactEmail} />
          <Field label="Site" name="website" type="url" required={false} placeholder="https://" defaultValue={val("website")} errors={fe?.website} />
          <Field label="Instagram" name="instagram" required={false} placeholder="semarroba" defaultValue={val("instagram")} errors={fe?.instagram} />
        </div>
      </Section>

      <Section title="Endereço" hint="Usado no atendimento presencial e nos documentos.">
        <Field label="Endereço" name="addressLine" required={false} placeholder="Rua, número, complemento" defaultValue={val("addressLine")} errors={fe?.addressLine} />
        <div className="grid gap-4 sm:grid-cols-[1fr_80px_120px]">
          <Field label="Cidade" name="addressCity" required={false} defaultValue={val("addressCity")} errors={fe?.addressCity} />
          <Field label="UF" name="addressState" required={false} placeholder="SP" maxLength={2} defaultValue={val("addressState")} errors={fe?.addressState} />
          <Field label="CEP" name="addressZip" required={false} inputMode="numeric" placeholder="00000-000" defaultValue={val("addressZip")} errors={fe?.addressZip} />
        </div>
      </Section>

      <Section title="Modalidades de atendimento" hint="Cada profissional configura as próprias; aqui é o que a clínica oferece.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox label="Atendimento presencial" name="offersInPerson" defaultChecked={checked("offersInPerson")} />
          <Checkbox label="Atendimento online" name="offersOnline" defaultChecked={checked("offersOnline")} />
        </div>
        {fe?.offersInPerson && <p className="field-error">{fe.offersInPerson[0]}</p>}
      </Section>

      <div className="w-40">
        <SubmitButton pendingText="Salvando…">Salvar</SubmitButton>
      </div>
    </form>
  );
}
