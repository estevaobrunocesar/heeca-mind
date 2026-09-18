import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Horário inválido");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

/**
 * Agendamento manual pelo profissional/recepção.
 * Paciente: existente (patientId) OU novo (nome + WhatsApp).
 */
export const createAppointmentSchema = z
  .object({
    patientId: z.string().trim().transform((v) => (v === "" ? null : v)),
    newPatientName: z.string().trim().max(120),
    newPatientWhatsapp: brPhone,
    serviceId: z.string().min(1, "Escolha o serviço"),
    modality: z.enum(["IN_PERSON", "ONLINE"], { message: "Escolha a modalidade" }),
    date: isoDate,
    time: hhmm,
    adminNote: optionalText(500),
    recurrence: z.enum(["NONE", "WEEKLY", "BIWEEKLY"]).default("NONE"),
    recurrenceUntil: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida"),
    force: checkbox,
  })
  .superRefine((d, ctx) => {
    if (!d.patientId) {
      if (d.newPatientName.length < 3) {
        ctx.addIssue({ code: "custom", path: ["newPatientName"], message: "Informe o nome do paciente" });
      }
      if (!d.newPatientWhatsapp) {
        ctx.addIssue({ code: "custom", path: ["newPatientWhatsapp"], message: "Informe o WhatsApp" });
      }
    }
    if (d.recurrence !== "NONE" && !d.recurrenceUntil) {
      ctx.addIssue({ code: "custom", path: ["recurrenceUntil"], message: "Informe até quando repetir" });
    }
    if (d.recurrenceUntil && d.recurrenceUntil < d.date) {
      ctx.addIssue({ code: "custom", path: ["recurrenceUntil"], message: "Deve ser depois da primeira sessão" });
    }
  });

export const rescheduleSchema = z.object({
  date: isoDate,
  time: hhmm,
  force: checkbox,
});

export const cancelSchema = z.object({
  by: z.enum(["professional", "patient"]),
  reason: optionalText(300),
  scope: z.enum(["one", "series"]).default("one"),
});

export const adminNoteSchema = z.object({ adminNote: optionalText(500) });

export const onlineLinkSchema = z.object({
  onlineLink: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "URL inválida"),
});
