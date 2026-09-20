import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";
import { serializeCommsPrefs } from "@/lib/comms-prefs";

/** Chave ausente no FormData → "" antes de validar (campos adicionados depois do formulário original). */
const optional = <T extends z.ZodType<unknown, string>>(inner: T) => z.string().optional().transform((v) => v ?? "").pipe(inner);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

/**
 * Cadastro administrativo do paciente. Nenhum campo clínico aqui — motivo,
 * queixa, diagnóstico e evolução pertencem ao módulo clínico cifrado.
 */
export const patientSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome").max(120, "Nome muito longo"),
  whatsapp: brPhone.refine((v) => v !== null, "Informe o WhatsApp"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
  usualModality: z.enum(["IN_PERSON", "ONLINE", "HYBRID", ""]).transform((v) => (v === "" ? null : v)),
  followUpStatus: z.enum(["ACTIVE", "PAUSED", "DISCHARGED", "INACTIVE"]),
  preferredPaymentMethod: z
    .enum(["PIX", "CASH", "CARD", "TRANSFER", "INSURANCE", "OTHER", ""])
    .transform((v) => (v === "" ? null : v)),
  needsReceipt: checkbox,
  bestContactTime: optionalText(80),
  adminNotes: optionalText(1000),
  // §12 — camada administrativa
  // Campos novos aceitam ausência (formulários antigos): `optional("")` = chave ausente vira "".
  phone: optional(brPhone),
  birthDate: optional(
    z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida")
      .refine((v) => v === null || new Date(v + "T00:00:00Z").getTime() < Date.now(), "A data de nascimento precisa estar no passado")
      .transform((v) => (v === null ? null : new Date(v + "T00:00:00Z"))),
  ),
  addressLine: optional(optionalText(200)),
  addressCity: optional(optionalText(80)),
  addressState: optional(
    z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a sigla do estado, ex.: SP"),
  ),
  addressZip: optional(
    z
      .string()
      .trim()
      .transform((v) => v.replace(/\D/g, ""))
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || v.length === 8, "CEP inválido"),
  ),
  emergencyContactName: optional(optionalText(120)),
  emergencyContactPhone: optional(brPhone),
  // Checkboxes → Json (null quando tudo ligado)
  prefWhatsapp: checkbox,
  prefReminder24h: checkbox,
  prefReminder2h: checkbox,
  // "convênio X, indicação" → ["convênio X", "indicação"]; upsert por nome na organização (actions.ts)
  tags: optional(
    z
      .string()
      .trim()
      .transform((v) => Array.from(new Set(v.split(",").map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => t.length > 0 && t.length <= 40))).slice(0, 15)),
  ),
});

export type PatientInput = z.infer<typeof patientSchema>;

/**
 * Separa o que vai direto para a coluna do que precisa de tratamento (prefs, tags).
 * Este módulo é importado por componentes cliente (rótulos): nada de Prisma aqui —
 * quem grava converte `commsPrefs: null` em `Prisma.JsonNull`.
 */
export function splitPatientInput(d: PatientInput) {
  const { prefWhatsapp, prefReminder24h, prefReminder2h, tags, ...columns } = d;
  return {
    columns,
    commsPrefs: serializeCommsPrefs({ whatsapp: prefWhatsapp, reminder24h: prefReminder24h, reminder2h: prefReminder2h }),
    tags,
  };
}

export const FOLLOW_UP_LABEL = {
  ACTIVE: "Em acompanhamento",
  PAUSED: "Pausado",
  DISCHARGED: "Alta",
  INACTIVE: "Inativo",
} as const;

export const PAYMENT_METHOD_LABEL = {
  PIX: "Pix",
  CASH: "Dinheiro",
  CARD: "Cartão",
  TRANSFER: "Transferência",
  INSURANCE: "Convênio",
  OTHER: "Outro",
} as const;
