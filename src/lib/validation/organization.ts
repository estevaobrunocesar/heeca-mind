import { z } from "zod";
import { checkbox } from "./common";
import { brPhone } from "./professional";
import { normalizeDocument } from "@/lib/br-document";
import { SLUG_PATTERN } from "@/lib/slug";

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

/** Cadastro da clínica (§6 do briefing). Só OWNER salva. */
export const organizationSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome").max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || SLUG_PATTERN.test(v), "Use letras minúsculas, números e hífens (3 a 60 caracteres)"),
    legalName: optionalText(160),
    document: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const r = normalizeDocument(v);
        if (!r.ok) {
          ctx.addIssue({ code: "custom", message: r.error });
          return z.NEVER;
        }
        return r.value;
      }),
    contactPhone: brPhone,
    whatsapp: brPhone,
    contactEmail: z
      .string()
      .trim()
      .toLowerCase()
      .transform((v) => (v === "" ? null : v))
      .refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
    website: optionalUrl,
    instagram: z
      .string()
      .trim()
      .transform((v) => v.replace(/^@/, ""))
      .transform((v) => (v === "" ? null : v)),
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
    offersOnline: checkbox,
    offersInPerson: checkbox,
  })
  .refine((o) => o.offersOnline || o.offersInPerson, { message: "Marque pelo menos uma modalidade de atendimento", path: ["offersInPerson"] });

export type OrganizationInput = z.infer<typeof organizationSchema>;
