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
