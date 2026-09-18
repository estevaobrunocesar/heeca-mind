import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail invalido");

const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(128, "Senha muito longa");

// CRP: "06/123456" ou "06123456" — 2 digitos de regiao + numero. Normalizamos
// para o formato com barra.
const crp = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 6 && v.length <= 8, "CRP invalido")
  .transform((v) => `${v.slice(0, 2)}/${v.slice(2)}`);

export const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  displayName: z.string().trim().min(2, "Informe como quer ser chamado(a)").max(60),
  crp,
  email,
  password,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({ email, password: z.string().min(1, "Informe a senha") });

export const requestResetSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password,
});
