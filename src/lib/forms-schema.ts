import { z } from "zod";

/**
 * Formulários pré-atendimento — definição e validação, sem banco.
 *
 * Um modelo é uma lista de campos (JSON). Um pedido guarda um SNAPSHOT dos
 * campos no momento do envio: editar o modelo depois não muda o que o
 * paciente viu nem invalida respostas antigas.
 */

export const FIELD_TYPES = ["short_text", "long_text", "yes_no", "single_choice", "multi_choice", "scale", "date", "info"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  short_text: "Texto curto",
  long_text: "Texto longo",
  yes_no: "Sim / não",
  single_choice: "Escolha única",
  multi_choice: "Múltipla escolha",
  scale: "Escala 0–10",
  date: "Data",
  info: "Texto informativo (sem resposta)",
};

export const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,40}$/, "id inválido"),
  type: z.enum(FIELD_TYPES),
  label: z.string().trim().min(1, "Pergunta vazia").max(2000),
  help: z.string().trim().max(500).optional(),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
});
export type FormField = z.infer<typeof fieldSchema>;

export const fieldsSchema = z
  .array(fieldSchema)
  .min(1, "Adicione ao menos um campo")
  .max(60, "Máximo de 60 campos")
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.id)) ctx.addIssue({ code: "custom", path: [i, "id"], message: `id repetido: ${f.id}` });
      seen.add(f.id);
      if (f.type !== "info" && f.label.length > 300) ctx.addIssue({ code: "custom", path: [i, "label"], message: "Pergunta com no máximo 300 caracteres" });
      if ((f.type === "single_choice" || f.type === "multi_choice") && (!f.options || f.options.length < 2)) {
        ctx.addIssue({ code: "custom", path: [i, "options"], message: "Escolhas precisam de ao menos 2 opções" });
      }
    });
  });

/** Resposta normalizada: string, string[] (multi), number (scale) ou boolean (yes_no). */
export type AnswerValue = string | string[] | number | boolean;
export type Answers = Record<string, AnswerValue>;

/**
 * Valida respostas cruas (FormData já convertido) contra o snapshot. Devolve
 * respostas tipadas e erros por campo. Campos `info` nunca têm resposta.
 */
export function validateAnswers(fields: FormField[], raw: Record<string, string | string[] | undefined>): { answers: Answers; errors: Record<string, string> } {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

  for (const f of fields) {
    if (f.type === "info") continue;
    const v = raw[f.id];
    switch (f.type) {
      case "short_text":
      case "long_text": {
        const s = one(v);
        const max = f.type === "short_text" ? 300 : 4000;
        if (s.length > max) errors[f.id] = `Máximo de ${max} caracteres`;
        else if (s) answers[f.id] = s;
        else if (f.required) errors[f.id] = "Obrigatório";
        break;
      }
      case "yes_no": {
        const s = one(v);
        if (s === "yes") answers[f.id] = true;
        else if (s === "no") answers[f.id] = false;
        else if (f.required) errors[f.id] = "Escolha sim ou não";
        break;
      }
      case "single_choice": {
        const s = one(v);
        if (s && !f.options?.includes(s)) errors[f.id] = "Opção inválida";
        else if (s) answers[f.id] = s;
        else if (f.required) errors[f.id] = "Escolha uma opção";
        break;
      }
      case "multi_choice": {
        const arr = (Array.isArray(v) ? v : v ? [v] : []).map((x) => x.trim()).filter(Boolean);
        if (arr.some((x) => !f.options?.includes(x))) errors[f.id] = "Opção inválida";
        else if (arr.length) answers[f.id] = [...new Set(arr)];
        else if (f.required) errors[f.id] = "Escolha ao menos uma opção";
        break;
      }
      case "scale": {
        const s = one(v);
        if (s === "") {
          if (f.required) errors[f.id] = "Escolha um valor";
          break;
        }
        const n = Number(s);
        if (!Number.isInteger(n) || n < 0 || n > 10) errors[f.id] = "Valor entre 0 e 10";
        else answers[f.id] = n;
        break;
      }
      case "date": {
        const s = one(v);
        if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[f.id] = "Data inválida";
        else if (s) answers[f.id] = s;
        else if (f.required) errors[f.id] = "Obrigatório";
        break;
      }
    }
  }
  return { answers, errors };
}

/** Texto legível de uma resposta (para exibição e impressão). */
export function formatAnswer(field: FormField, value: AnswerValue | undefined): string {
  if (value === undefined) return "—";
  if (field.type === "yes_no") return value ? "Sim" : "Não";
  if (field.type === "scale") return `${value}/10`;
  if (field.type === "date" && typeof value === "string") return value.split("-").reverse().join("/");
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

/** Modelos iniciais — o profissional edita à vontade. */
export const STARTER_TEMPLATES: Array<{ key: string; title: string; description: string; kind: "INTAKE" | "CONSENT" | "QUESTIONNAIRE"; dataClass: "CLINICAL" | "ADMINISTRATIVE"; fields: FormField[] }> = [
  {
    key: "intake",
    title: "Ficha inicial",
    description: "Algumas perguntas para conhecermos você antes da primeira sessão. Responda o que se sentir confortável.",
    kind: "INTAKE",
    dataClass: "CLINICAL",
    fields: [
      { id: "como_chamar", type: "short_text", label: "Como prefere ser chamado(a)?", required: false },
      { id: "motivo", type: "long_text", label: "O que te motivou a buscar atendimento agora?", required: true },
      { id: "terapia_antes", type: "yes_no", label: "Já fez psicoterapia antes?", required: true },
      { id: "terapia_antes_como", type: "long_text", label: "Se sim, como foi a experiência?", required: false },
      { id: "acompanhamento", type: "multi_choice", label: "Faz algum acompanhamento atualmente?", required: false, options: ["Psiquiatria", "Clínico geral", "Neurologia", "Nutrição", "Outro", "Nenhum"] },
      { id: "medicacao", type: "long_text", label: "Usa alguma medicação? Qual?", required: false },
      { id: "sono", type: "scale", label: "Como avalia seu sono nas últimas semanas? (0 = péssimo, 10 = ótimo)", required: false },
      { id: "expectativa", type: "long_text", label: "O que espera do atendimento?", required: false },
      { id: "emergencia", type: "short_text", label: "Contato de emergência (nome e telefone)", help: "Usado só em situação de risco.", required: false },
    ],
  },
  {
    key: "consent_online",
    title: "Termo de consentimento — atendimento online",
    description: "Leia e confirme para que possamos realizar o atendimento por videochamada.",
    kind: "CONSENT",
    dataClass: "ADMINISTRATIVE",
    fields: [
      {
        id: "termo",
        type: "info",
        label:
          "O atendimento psicológico online segue a Resolução CFP nº 09/2024. As sessões acontecem por videochamada, em ambiente privado escolhido por você. Não são gravadas. O sigilo profissional é o mesmo do atendimento presencial. Em situação de risco, o profissional pode acionar seu contato de emergência ou serviços locais.",
        required: false,
      },
      { id: "ambiente", type: "yes_no", label: "Confirmo que terei um ambiente privado e conexão adequada para as sessões.", required: true },
      { id: "aceite", type: "yes_no", label: "Li e concordo com as condições do atendimento online.", required: true },
      { id: "nome_completo", type: "short_text", label: "Nome completo (como assinatura)", required: true },
    ],
  },
  {
    key: "checkin",
    title: "Check-in semanal",
    description: "Um minuto antes da sessão: como foi a semana?",
    kind: "QUESTIONNAIRE",
    dataClass: "CLINICAL",
    fields: [
      { id: "humor", type: "scale", label: "Humor geral na semana (0 = muito baixo, 10 = muito bom)", required: true },
      { id: "ansiedade", type: "scale", label: "Nível de ansiedade (0 = nenhuma, 10 = máxima)", required: true },
      { id: "tarefa", type: "yes_no", label: "Conseguiu fazer a tarefa combinada?", required: false },
      { id: "trazer", type: "long_text", label: "Algo que quer trazer para a sessão?", required: false },
    ],
  },
];
