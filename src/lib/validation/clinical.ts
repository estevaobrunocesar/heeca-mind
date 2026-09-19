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

export const delegationSchema = z.object({
  delegateProfessionalId: z.string().trim().min(1, "Escolha o profissional"),
  patientId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  kind: z.enum(["SUPERVISION", "SUBSTITUTION"], { message: "Escolha o tipo" }),
  reason: z.string().trim().min(5, "Explique o motivo (ex.: férias 20–30/09, supervisão do caso)").max(200, "Máximo de 200 caracteres"),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida"),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida"),
});

export const revokeDelegationSchema = deleteNoteSchema;
