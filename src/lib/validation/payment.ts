import { z } from "zod";
import { parseBRLToCents } from "@/lib/money";

export const PAYMENT_METHODS = ["PIX", "CASH", "CARD", "TRANSFER", "INSURANCE", "OTHER"] as const;

/** Registro de pagamento de uma sessão. Valor vazio = valor da sessão. */
export const registerPaymentSchema = z.object({
  method: z.enum(PAYMENT_METHODS, { message: "Escolha a forma de pagamento" }),
  amount: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const cents = parseBRLToCents(v);
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: "custom", message: "Valor inválido. Ex.: 250,00" });
        return z.NEVER;
      }
      return cents;
    }),
  paidAt: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida"),
  note: z
    .string()
    .trim()
    .max(200, "Máximo de 200 caracteres")
    .transform((v) => (v === "" ? null : v)),
});
