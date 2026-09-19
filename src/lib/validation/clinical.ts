import { z } from "zod";

export const clinicalNoteSchema = z.object({
  kind: z.enum(["EVOLUTION", "NOTE", "ASSESSMENT"], { message: "Escolha o tipo" }),
  appointmentId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  content: z.string().trim().min(3, "Escreva a anotação").max(20000, "Máximo de 20.000 caracteres"),
});

export const deleteNoteSchema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo").max(200),
});

export const clinicalDocumentSchema = z.object({
  kind: z.enum(["REPORT", "REFERRAL", "DECLARATION", "CERTIFICATE", "CONSENT", "EXAM", "OTHER"], { message: "Escolha o tipo" }),
  title: z.string().trim().min(3, "Dê um título ao documento").max(120, "Máximo de 120 caracteres"),
  description: z
    .string()
    .trim()
    .max(500, "Máximo de 500 caracteres")
    .transform((v) => (v === "" ? null : v)),
  appointmentId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
});

export const deleteDocumentSchema = deleteNoteSchema;
