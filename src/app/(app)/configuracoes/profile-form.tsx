"use client";

import { useActionState } from "react";
import { Checkbox, Field, FormError, FormSuccess, Select, SubmitButton, TextArea } from "@/components/ui/form";
import type { FormState } from "@/lib/form";
import { updateProfileAction } from "./actions";
import { registrationSpec } from "@/lib/registration";

export type ProfileValues = {
  displayName: string;
  fullName: string;
  registrationKind: string;
  registrationNumber: string | null;
  showRegistration: boolean;
  bio: string | null;
  approaches: string[];
  specialties: string[];
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  website: string | null;
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  slug: string;
  showPrices: boolean;
  onlinePlatform: "GOOGLE_MEET" | "ZOOM" | "TEAMS" | "OTHER" | null;
  onlineFixedLink: string | null;
};

const PLATFORM_OPTIONS = [
  { value: "", label: "Não informado" },
  { value: "GOOGLE_MEET", label: "Google Meet" },
  { value: "ZOOM", label: "Zoom" },
  { value: "TEAMS", label: "Microsoft Teams" },
  { value: "OTHER", label: "Outra" },
] as const;

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className="text-base font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-text-muted">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

export function ProfileForm({ profile, publicBaseUrl }: { profile: ProfileValues; publicBaseUrl: string }) {
  const spec = registrationSpec(profile.registrationKind);
  const [state, action] = useActionState<FormState, FormData>(updateProfileAction, {});
  const fe = state.fieldErrors;
  const v = state.values;
  const val = <K extends keyof ProfileValues>(k: K): string | undefined => {
    if (v && k in v) return v[k];
    const orig = profile[k];
    if (orig === null || orig === undefined) return undefined;
    if (Array.isArray(orig)) return orig.join(", ");
    return String(orig);
  };
  const checked = (k: "showRegistration" | "showPrices") => (v ? v[k] === "on" : profile[k]);

  return (
    <form action={action} className="max-w-3xl space-y-6">
      <FormError message={state.error} />
      {state.ok && <FormSuccess message="Perfil salvo." />}

      <Section title="Identidade profissional" hint="O que os pacientes veem na sua página de agendamento.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome profissional" name="displayName" defaultValue={val("displayName")} errors={fe?.displayName} />
          <Field label="Nome completo" name="fullName" defaultValue={val("fullName")} errors={fe?.fullName} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={spec.fieldLabel} name="registrationNumber" placeholder={spec.placeholder} defaultValue={val("registrationNumber")} errors={fe?.registrationNumber} />
          <div className="pt-7">
            <Checkbox label={`Exibir ${spec.label || "registro"} na página pública`} name="showRegistration" defaultChecked={checked("showRegistration")} />
          </div>
        </div>
        <TextArea
          label="Descrição da atuação"
          name="bio"
          rows={4}
          placeholder="Conte brevemente como você trabalha e para quem."
          defaultValue={val("bio")}
          errors={fe?.bio}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Abordagens"
            name="approaches"
            required={false}
            placeholder="TCC, Psicanálise"
            hint="Separe por vírgula."
            defaultValue={val("approaches")}
            errors={fe?.approaches}
          />
          <Field
            label="Especialidades"
            name="specialties"
            required={false}
            placeholder="Ansiedade, Adolescentes"
            hint="Separe por vírgula."
            defaultValue={val("specialties")}
            errors={fe?.specialties}
          />
        </div>
      </Section>

      <Section title="Contato">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="WhatsApp"
            name="whatsapp"
            type="tel"
            required={false}
            placeholder="(11) 99999-0000"
            hint="Usado nas mensagens automáticas e no botão da página pública."
            defaultValue={val("whatsapp")}
            errors={fe?.whatsapp}
          />
          <Field label="Telefone" name="phone" type="tel" required={false} defaultValue={val("phone")} errors={fe?.phone} />
        </div>
        <Field label="E-mail profissional" name="email" type="email" required={false} defaultValue={val("email")} errors={fe?.email} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" name="instagram" required={false} placeholder="@seu.perfil" defaultValue={val("instagram")} errors={fe?.instagram} />
          <Field label="Site" name="website" required={false} placeholder="https://…" defaultValue={val("website")} errors={fe?.website} />
        </div>
      </Section>

      <Section title="Consultório" hint="Deixe em branco se atende apenas online.">
        <Field label="Endereço" name="addressLine" required={false} placeholder="Rua, número, sala" defaultValue={val("addressLine")} errors={fe?.addressLine} />
        <div className="grid gap-4 sm:grid-cols-[1fr_6rem_8rem]">
          <Field label="Cidade" name="addressCity" required={false} defaultValue={val("addressCity")} errors={fe?.addressCity} />
          <Field label="UF" name="addressState" required={false} placeholder="SP" defaultValue={val("addressState")} errors={fe?.addressState} />
          <Field label="CEP" name="addressZip" required={false} placeholder="00000-000" defaultValue={val("addressZip")} errors={fe?.addressZip} />
        </div>
      </Section>

      <Section title="Atendimento online">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Plataforma" name="onlinePlatform" options={PLATFORM_OPTIONS} defaultValue={val("onlinePlatform") ?? ""} errors={fe?.onlinePlatform} />
          <Field
            label="Link fixo da sala"
            name="onlineFixedLink"
            required={false}
            placeholder="https://meet.google.com/…"
            hint="Se vazio, você informa o link em cada sessão."
            defaultValue={val("onlineFixedLink")}
            errors={fe?.onlineFixedLink}
          />
        </div>
      </Section>

      <Section title="Página pública">
        <div>
          <label htmlFor="field-slug" className="label">
            Link de agendamento
          </label>
          <div className="flex items-center overflow-hidden rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
            <span className="shrink-0 border-r border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">
              {publicBaseUrl}/agendar/
            </span>
            <input
              id="field-slug"
              name="slug"
              className="w-full bg-transparent px-3 py-2 text-sm outline-none"
              defaultValue={val("slug")}
              aria-invalid={!!fe?.slug}
            />
          </div>
          {fe?.slug ? (
            <p className="field-error">{fe.slug[0]}</p>
          ) : (
            <p className="mt-1 text-xs text-text-muted">
              Atenção: ao mudar, links já compartilhados deixam de funcionar.
            </p>
          )}
        </div>
        <Checkbox
          label="Exibir valores na página pública"
          name="showPrices"
          defaultChecked={checked("showPrices")}
          hint="Desmarque para que o paciente veja apenas duração e modalidade."
        />
      </Section>

      <div className="flex justify-end">
        <div className="w-44">
          <SubmitButton pendingText="Salvando…">Salvar perfil</SubmitButton>
        </div>
      </div>
    </form>
  );
}
