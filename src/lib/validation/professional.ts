import { z } from "zod";
import { checkbox } from "./common";
import { SLUG_PATTERN } from "@/lib/slug";
import { hhmmToMinutes, isHHmm } from "@/lib/time";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Informe uma URL começando com http:// ou https://");

/**
 * Telefone brasileiro em qualquer formato -> E.164 (+55DDDNÚMERO).
 * "(11) 99999-0000" -> "+5511999990000". Aceita já com 55 na frente.
 */
export const brPhone = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v.replace(/\D/g, "")))
  .refine((d) => d === null || d.length === 10 || d.length === 11 || d.length === 12 || d.length === 13, {
    message: "Telefone inválido. Use DDD + número, ex.: (11) 99999-0000",
  })
  .transform((d) => {
    if (d === null) return null;
    const withCountry = d.length <= 11 ? `55${d}` : d;
    return `+${withCountry}`;
  });

/** "TCC, Psicanálise , " -> ["TCC", "Psicanálise"] */
const tagList = z
  .string()
  .transform((v) =>
    v
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0)
      .slice(0, 20),
  );

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Informe o nome profissional").max(60),
  fullName: z.string().trim().min(3, "Informe o nome completo").max(120),
  crp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 6 && v.length <= 8, "CRP inválido")
    .transform((v) => `${v.slice(0, 2)}/${v.slice(2)}`),
  showCrp: checkbox,
  photoUrl: optionalUrl,
  bio: optionalText(1200),
  approaches: tagList,
  specialties: tagList,
  phone: brPhone,
  whatsapp: brPhone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
  instagram: z
    .string()
    .trim()
    .transform((v) => v.replace(/^@/, ""))
    .transform((v) => (v === "" ? null : v)),
  website: optionalUrl,
  addressLine: optionalText(200),
  addressCity: optionalText(80),
  addressState: z
    .string()
    .trim()
    .toUpperCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a sigla do estado, ex.: SP"),
  addressZip: z
    .string()
    .trim()
    .transform((v) => v.replace(/\D/g, ""))
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || v.length === 8, "CEP inválido"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_PATTERN, "Use apenas letras minúsculas, números e hífens (3 a 60 caracteres)"),
  showPrices: checkbox,
  onlinePlatform: z
    .enum(["GOOGLE_MEET", "ZOOM", "TEAMS", "OTHER", ""])
    .transform((v) => (v === "" ? null : v)),
  onlineFixedLink: optionalUrl,
});

export const scheduleSettingsSchema = z
  .object({
    defaultDurationMinutes: z.coerce.number().int().min(10).max(480),
    bufferMinutes: z.coerce.number().int().min(0).max(120),
    slotStepMinutes: z.coerce.number().int().refine((v) => [10, 15, 20, 30, 60].includes(v), "Passo inválido"),
    minAdvanceHours: z.coerce.number().int().min(0).max(24 * 30),
    minCancelHours: z.coerce.number().int().min(0).max(24 * 30),
    minRescheduleHours: z.coerce.number().int().min(0).max(24 * 30),
    maxSessionsPerDay: z
      .string()
      .trim()
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 30), "Entre 1 e 30, ou vazio"),
    lateToleranceMinutes: z.coerce.number().int().min(0).max(60),
    maxBookingDaysAhead: z.coerce.number().int().min(1).max(365),
  });

const availabilityRule = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().refine(isHHmm, "Horário inválido"),
    endTime: z.string().refine(isHHmm, "Horário inválido"),
  })
  .refine((r) => hhmmToMinutes(r.startTime) < hhmmToMinutes(r.endTime), {
    message: "O início deve ser antes do fim",
  });

/**
 * Grade semanal completa. Faixas do mesmo dia não podem se sobrepor.
 * Enviada como JSON num campo hidden — ver availability-editor.tsx.
 */
export const availabilitySchema = z
  .array(availabilityRule)
  .max(7 * 6, "Muitas faixas")
  .superRefine((rules, ctx) => {
    for (let wd = 0; wd <= 6; wd++) {
      const day = rules
        .filter((r) => r.weekday === wd)
        .map((r) => ({ s: hhmmToMinutes(r.startTime), e: hhmmToMinutes(r.endTime) }))
        .sort((a, b) => a.s - b.s);
      for (let i = 1; i < day.length; i++) {
        if (day[i].s < day[i - 1].e) {
          ctx.addIssue({ code: "custom", message: `Faixas sobrepostas em ${["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][wd]}` });
          return;
        }
      }
    }
  });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const blockSchema = z
  .object({
    type: z.enum(["BLOCK", "DAY_OFF", "VACATION"]),
    startDate: isoDate,
    startTime: z.string().refine((v) => v === "" || isHHmm(v), "Horário inválido"),
    endDate: isoDate,
    endTime: z.string().refine((v) => v === "" || isHHmm(v), "Horário inválido"),
    reason: optionalText(200),
  })
  .transform((b) => ({
    ...b,
    // Sem horário = dia inteiro.
    startTime: b.startTime || "00:00",
    endTime: b.endTime || "23:59",
  }));

export const exceptionSchema = z
  .object({
    date: isoDate,
    startTime: z.string().refine(isHHmm, "Horário inválido"),
    endTime: z.string().refine(isHHmm, "Horário inválido"),
    note: optionalText(200),
  })
  .refine((e) => hhmmToMinutes(e.startTime) < hhmmToMinutes(e.endTime), {
    message: "O início deve ser antes do fim",
    path: ["endTime"],
  });

export const policySchema = z.object({
  cancellationPolicy: optionalText(1000),
  noShowPolicy: optionalText(1000),
  reschedulePolicy: optionalText(1000),
  confirmationPolicy: optionalText(1000),
  onlineInstructions: optionalText(1500),
  paymentInfo: optionalText(1000),
  terms: optionalText(3000),
});
