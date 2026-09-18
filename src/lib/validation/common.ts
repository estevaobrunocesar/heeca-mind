import { z } from "zod";

/**
 * Checkbox HTML: presente como "on" quando marcado, AUSENTE quando não.
 * Em zod 4 a chave só é opcional com `.optional()` — uma union com
 * z.undefined() não conta e falha com "expected nonoptional".
 */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => v === "on" || v === "true");
