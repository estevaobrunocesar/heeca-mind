import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";

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
});

export type PatientInput = z.infer<typeof patientSchema>;

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
