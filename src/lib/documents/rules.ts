/**
 * Documentos administrativos e consentimentos (§15) — regras puras, sem banco.
 * Testadas em tests/document-rules.test.ts.
 *
 * O aceite é uma assinatura eletrônica simples: o paciente lê o texto exato (snapshot), digita o
 * nome e clica. Guardamos instante, IP, user-agent e um hash que amarra tudo ao texto. Assinatura
 * qualificada (ICP/provedor) é Fase 2 e entra ao lado, sem mudar este desenho.
 */
import { createHash } from "node:crypto";

/** Variáveis permitidas no corpo do modelo. Nada clínico entra aqui. */
export const DOCUMENT_VARIABLES = {
  "paciente.nome": "Nome do paciente",
  "profissional.nome": "Nome profissional",
  "profissional.registro": "Registro (ex.: CRP 06/123456)",
  "clinica.nome": "Nome da clínica/consultório",
  "clinica.documento": "CPF/CNPJ da clínica",
  "servico": "Serviço da sessão (quando enviado a partir de uma sessão)",
  "valor": "Valor do serviço (idem)",
  "sessao.data": "Data e hora da sessão (idem)",
  "data": "Data de hoje",
} as const;

export type DocumentVariable = keyof typeof DOCUMENT_VARIABLES;

const VAR_RE = /\{\{\s*([a-z]+(?:\.[a-z]+)?)\s*\}\}/g;

/** Variáveis usadas no texto, na ordem, sem repetição. */
export function extractVariables(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** Variáveis usadas que não existem no catálogo (erro de digitação no modelo). */
export function unknownVariables(body: string): string[] {
  return extractVariables(body).filter((v) => !(v in DOCUMENT_VARIABLES));
}

/**
 * Preenche as variáveis. `missing` lista as que não tinham valor — quem envia decide se bloqueia
 * (ex.: {{servico}} num envio sem sessão) ou preenche com "—".
 */
export function renderDocument(body: string, values: Partial<Record<DocumentVariable, string>>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(VAR_RE, (_, key: string) => {
    const v = values[key as DocumentVariable];
    if (v === undefined || v === "") {
      if (!missing.includes(key)) missing.push(key);
      return "—";
    }
    return v;
  });
  return { text, missing };
}

/** Forma canônica do texto: quebras de linha normalizadas, sem espaços à direita. */
export function canonicalBody(text: string): string {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim();
}

export function bodyHash(text: string): string {
  return createHash("sha256").update(canonicalBody(text), "utf8").digest("hex");
}

/** Amarra o aceite ao texto: quem, quando, de onde, sobre exatamente qual conteúdo. */
export function acceptanceHash(input: { bodyHash: string; name: string; acceptedAt: Date; ip: string | null }): string {
  return createHash("sha256").update([input.bodyHash, normalizeName(input.name), input.acceptedAt.toISOString(), input.ip ?? ""].join("|"), "utf8").digest("hex");
}

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O nome digitado confere com o cadastro? Exige o nome completo normalizado igual, ou pelo menos
 * primeiro e último nome iguais (aceita "Maria Souza" para "Maria da Silva Souza").
 */
export function nameMatches(typed: string, registered: string): boolean {
  const a = normalizeName(typed).split(" ").filter(Boolean);
  const b = normalizeName(registered).split(" ").filter(Boolean);
  if (a.length < 2 || b.length < 2) return a.join(" ") === b.join(" ") && a.length > 0;
  if (a.join(" ") === b.join(" ")) return true;
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

export type DocumentStatus = "PENDING" | "VIEWED" | "ACCEPTED" | "EXPIRED" | "REVOKED";

export function canAccept(status: DocumentStatus, expiresAt: Date, now: Date): boolean {
  return (status === "PENDING" || status === "VIEWED") && expiresAt.getTime() > now.getTime();
}

export const DOCUMENT_KIND_LABEL = {
  CONSENT: "Termo de consentimento",
  CONTRACT: "Contrato",
  POLICY: "Política",
  AUTHORIZATION: "Autorização",
  OTHER: "Documento",
} as const;

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  PENDING: "Enviado",
  VIEWED: "Visualizado",
  ACCEPTED: "Aceito",
  EXPIRED: "Expirado",
  REVOKED: "Cancelado",
};

/** O modelo mudou de verdade? (título ou texto) → nova versão. */
export function isNewVersion(before: { title: string; body: string }, after: { title: string; body: string }): boolean {
  return canonicalBody(before.body) !== canonicalBody(after.body) || before.title.trim() !== after.title.trim();
}

/** Modelos iniciais (administrativos, sem conteúdo clínico). O profissional edita depois. */
export const DEFAULT_DOCUMENT_TEMPLATES: Array<{ kind: "CONSENT" | "CONTRACT" | "POLICY"; title: string; requireBeforeFirstSession: boolean; body: string }> = [
  {
    kind: "CONSENT",
    title: "Termo de consentimento para atendimento psicológico",
    requireBeforeFirstSession: true,
    body: `Eu, {{paciente.nome}}, declaro que fui informado(a) por {{profissional.nome}} ({{profissional.registro}}) sobre a natureza do atendimento psicológico, seus objetivos, a forma de trabalho e as condições de agendamento.

Estou ciente de que:
- as informações compartilhadas durante as sessões são protegidas pelo sigilo profissional, nos termos do Código de Ética Profissional do Psicólogo;
- o sigilo poderá ser relativizado apenas nas situações previstas em lei e no Código de Ética;
- os registros do atendimento são de responsabilidade do(a) profissional e mantidos pelo prazo legal;
- posso interromper o atendimento a qualquer momento, comunicando o(a) profissional.

Consinto com o início do atendimento nas condições acima.

{{clinica.nome}} · {{data}}`,
  },
  {
    kind: "CONTRACT",
    title: "Contrato de prestação de serviços",
    requireBeforeFirstSession: false,
    body: `Contratante: {{paciente.nome}}
Contratado(a): {{profissional.nome}} ({{profissional.registro}}) — {{clinica.nome}}, {{clinica.documento}}

1. Objeto: prestação de serviços de atendimento psicológico, na modalidade e frequência combinadas entre as partes.
2. Valor: {{valor}} por sessão, salvo pacote ou condição específica acordada por escrito.
3. Pagamento: conforme combinado (Pix, cartão, dinheiro ou transferência), até a data da sessão.
4. Cancelamento e faltas: cancelamentos com menos de 24 horas de antecedência e faltas sem aviso poderão ser cobrados integralmente.
5. Vigência: por prazo indeterminado, podendo ser encerrado por qualquer das partes mediante comunicação.

Ao aceitar, as partes concordam com as condições acima. {{data}}`,
  },
  {
    kind: "POLICY",
    title: "Política de cancelamento e faltas",
    requireBeforeFirstSession: false,
    body: `Para {{paciente.nome}}:

- Cancelamentos e reagendamentos devem ser solicitados com pelo menos 24 horas de antecedência.
- Cancelamentos fora desse prazo e faltas sem aviso poderão ser cobrados integralmente.
- Atrasos reduzem o tempo da sessão, que termina no horário previsto.
- Sessões cobertas por pacote seguem a mesma regra: a falta pode ser descontada do saldo.

{{profissional.nome}} · {{clinica.nome}} · {{data}}`,
  },
];
