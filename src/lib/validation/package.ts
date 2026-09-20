import { z } from "zod";
import { checkbox } from "./common";
import { parseBRLToCents } from "@/lib/money";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .transform((v) => (v === "" ? null : v));

/** Catálogo de pacotes (§20). Pertence ao profissional ativo (D1). */
export const packageSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80, "Nome muito longo"),
  description: optionalText(500),
  sessionsCount: z.coerce.number({ message: "Informe a quantidade" }).int("Use um número inteiro").min(1, "Mínimo de 1 sessão").max(100, "Máximo de 100 sessões"),
  validityDays: z.coerce.number({ message: "Informe a validade" }).int("Use dias inteiros").min(7, "Mínimo de 7 dias").max(730, "Máximo de 2 anos"),
  price: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseBRLToCents(v);
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 1.000,00" });
        return z.NEVER;
      }
      return cents;
    }),
  /** ids dos serviços cobertos; vazio = qualquer serviço do profissional. Chega como lista de checkboxes. */
  serviceIds: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter((s) => s.length > 0)),
  isActive: checkbox,
});

export type PackageInput = z.infer<typeof packageSchema>;

export const sellPackageSchema = z.object({
  packageId: z.string().min(1, "Escolha o pacote"),
  note: optionalText(300),
});

export const reasonSchema = z.object({ reason: z.string().trim().min(3, "Informe o motivo").max(300) });
