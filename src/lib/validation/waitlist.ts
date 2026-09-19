import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";

const prefsShape = {
  modality: z
    .string()
    .trim()
    .transform((v) => (v === "IN_PERSON" || v === "ONLINE" ? v : null)),
  weekdays: z.array(z.string()).or(z.string()).optional(),
  periods: z.array(z.string()).or(z.string()).optional(),
};

/** Página pública: entrar na lista de espera de um profissional. */
export const publicWaitlistSchema = z.object({
  serviceId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  ...prefsShape,
  name: z.string().trim().min(3, "Informe seu nome").max(120, "Nome muito longo"),
  whatsapp: brPhone.refine((v) => v !== null, "Informe seu WhatsApp"),
  consent: checkbox.refine((v) => v, "É necessário aceitar para continuar"),
  website: z.string().max(0, "Inválido").optional(), // honeypot
});

/** Painel: adicionar manualmente um paciente já cadastrado. */
export const manualWaitlistSchema = z.object({
  patientId: z.string().trim().min(1, "Escolha o paciente"),
  serviceId: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v)),
  ...prefsShape,
  note: z
    .string()
    .trim()
    .max(200, "Máximo de 200 caracteres")
    .transform((v) => (v === "" ? null : v)),
  priority: checkbox,
});

/** Painel: oferecer um horário concreto. */
export const offerSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Escolha uma data"),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Escolha um horário"),
  modality: z.enum(["IN_PERSON", "ONLINE"], { message: "Escolha a modalidade" }),
});

export const removeWaitlistSchema = z.object({
  reason: z.string().trim().min(3, "Informe o motivo").max(200),
});
