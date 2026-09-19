import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";

/**
 * Formulário público de agendamento.
 * Deliberadamente enxuto: nome, WhatsApp, e-mail opcional e uma observação
 * livre. Nenhum campo clínico (motivo, queixa, diagnóstico) — ver spec §6.
 */
export const publicBookingSchema = z
  .object({
    serviceId: z.string().min(1),
    modality: z.enum(["IN_PERSON", "ONLINE"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data"),
    time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Escolha um horário"),
    name: z.string().trim().min(3, "Informe seu nome").max(120, "Nome muito longo"),
    whatsapp: brPhone.refine((v) => v !== null, "Informe seu WhatsApp"),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
    note: z
      .string()
      .trim()
      .max(300, "Máximo de 300 caracteres")
      .transform((v) => (v === "" ? null : v)),
    consent: checkbox.refine((v) => v, "É necessário aceitar para continuar"),
    // Honeypot: campo invisível que humanos não preenchem.
    website: z.string().max(0, "Inválido").optional(),
  });

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
