import { z } from "zod";
import { registrationField } from "./registration";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("E-mail invalido");

const password = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(128, "Senha muito longa");

export const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  displayName: z.string().trim().min(2, "Informe como quer ser chamado(a)").max(60),
  // Cadastro local é sempre Psicologia; outros segmentos chegam pelo provisionamento do portal.
  registrationNumber: registrationField("CRP"),
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
