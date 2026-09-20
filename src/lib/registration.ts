/**
 * Registro profissional por conselho (docs/mind/01-ARQUITETURA.md §6, 02-ERD.md).
 *
 * O Mind nasce orientado a Psicologia (CRP), mas o campo é genérico para que
 * outras especialidades entrem por configuração — sem tocar nas telas, que só
 * conhecem `formatRegistration()` e `registrationSpec()`.
 *
 * Puro: sem banco, sem ambiente. Testado em tests/registration.test.ts.
 */

export type RegistrationKind = "CRP" | "CRN" | "CRFa" | "NONE";

export type RegistrationSpec = {
  kind: RegistrationKind;
  /** Rótulo curto que precede o número ("CRP 06/123456"). */
  label: string;
  /** Texto do campo no formulário. */
  fieldLabel: string;
  placeholder: string;
  /** Normaliza a digitação para a forma canônica; devolve null se inválida. */
  normalize: (raw: string) => string | null;
  invalidMessage: string;
};

const digitsOnly = (v: string) => v.replace(/\D/g, "");

// CRP: "06/123456" ou "06123456" — 2 dígitos de região + 4 a 6 do número.
// Regra herdada de validation/auth.ts e validation/professional.ts (agora só aqui).
const CRP: RegistrationSpec = {
  kind: "CRP",
  label: "CRP",
  fieldLabel: "CRP",
  placeholder: "06/123456",
  normalize: (raw) => {
    const d = digitsOnly(raw);
    if (d.length < 6 || d.length > 8) return null;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
  },
  invalidMessage: "CRP inválido",
};

// CRN: "CRN-3 12345" — região (1 ou 2 dígitos) + número. Guardamos "3/12345".
const CRN: RegistrationSpec = {
  kind: "CRN",
  label: "CRN",
  fieldLabel: "CRN",
  placeholder: "3/12345",
  normalize: (raw) => {
    const d = digitsOnly(raw);
    if (d.length < 5 || d.length > 8) return null;
    const region = d.length >= 7 ? d.slice(0, 2) : d.slice(0, 1);
    return `${region}/${d.slice(region.length)}`;
  },
  invalidMessage: "CRN inválido",
};

// CRFa: "CRFa 2-12345" — região (1 dígito) + número. Guardamos "2/12345".
const CRFa: RegistrationSpec = {
  kind: "CRFa",
  label: "CRFa",
  fieldLabel: "CRFa",
  placeholder: "2/12345",
  normalize: (raw) => {
    const d = digitsOnly(raw);
    if (d.length < 5 || d.length > 7) return null;
    return `${d.slice(0, 1)}/${d.slice(1)}`;
  },
  invalidMessage: "CRFa inválido",
};

const NONE: RegistrationSpec = {
  kind: "NONE",
  label: "",
  fieldLabel: "Registro profissional",
  placeholder: "",
  normalize: (raw) => {
    const v = raw.trim();
    return v.length === 0 ? null : v.slice(0, 40);
  },
  invalidMessage: "Registro inválido",
};

export const REGISTRATION_SPECS: Record<RegistrationKind, RegistrationSpec> = { CRP, CRN, CRFa, NONE };

/** Tipo de registro padrão de cada segmento do tenant (Organization.segment). */
export const DEFAULT_REGISTRATION_BY_SEGMENT = {
  PSYCHOLOGY: "CRP",
  THERAPY: "NONE",
} as const satisfies Record<string, RegistrationKind>;

export function isRegistrationKind(v: string): v is RegistrationKind {
  return v in REGISTRATION_SPECS;
}

export function registrationSpec(kind: string | null | undefined): RegistrationSpec {
  return kind && isRegistrationKind(kind) ? REGISTRATION_SPECS[kind] : CRP;
}

/**
 * "CRP 06/123456" para exibição; null quando não há número ou o profissional
 * pediu para não exibir (`showRegistration`). Quem chama decide se o contexto
 * é público (respeita `showRegistration`) ou interno (passa `force`).
 */
export function formatRegistration(
  p: { registrationKind: string; registrationNumber: string | null; showRegistration?: boolean },
  opts: { force?: boolean } = {},
): string | null {
  if (!p.registrationNumber) return null;
  if (!opts.force && p.showRegistration === false) return null;
  const spec = registrationSpec(p.registrationKind);
  return spec.label ? `${spec.label} ${p.registrationNumber}` : p.registrationNumber;
}
