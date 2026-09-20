import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/slug";

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  role: z.enum(["PROFESSIONAL", "RECEPTIONIST", "FINANCE"], { message: "Escolha o papel" }),
});

export const clinicSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || SLUG_PATTERN.test(v), "Use letras minúsculas, números e hífens (3 a 60 caracteres)"),
});

/** Aceite do convite: cria a conta e, se profissional, o perfil. */
export const acceptInviteSchema = z
  .object({
    token: z.string().min(20),
    fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(128),
    // Só para PROFESSIONAL — validados no servidor conforme o papel do convite.
    displayName: z.string().trim().max(60),
    registrationNumber: z.string().trim(),
  });

export const ROLE_LABEL = { OWNER: "Responsável", PROFESSIONAL: "Profissional", RECEPTIONIST: "Recepção", FINANCE: "Financeiro" } as const;
