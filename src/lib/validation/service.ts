import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

export const serviceSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do atendimento").max(80, "Nome muito longo"),
  description: optionalText(500),
  durationMinutes: z.coerce
    .number({ message: "Informe a duração" })
    .int("Use minutos inteiros")
    .min(10, "Mínimo de 10 minutos")
    .max(480, "Máximo de 8 horas"),
  price: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseBRLToCents(v);
      if (cents === null) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 250,00" });
        return z.NEVER;
      }
      return cents;
    }),
  modality: z.enum(["IN_PERSON", "ONLINE", "HYBRID"], { message: "Escolha a modalidade" }),
  patientInstructions: optionalText(1000),
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.undefined()])
    .transform((v) => v === "on" || v === "true"),
});

export type ServiceInput = z.infer<typeof serviceSchema>;
