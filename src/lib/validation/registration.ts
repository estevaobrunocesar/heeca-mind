import { z } from "zod";
import { registrationSpec, type RegistrationKind } from "@/lib/registration";

/**
 * Campo de registro profissional para formulários: normaliza pela regra do
 * conselho (src/lib/registration.ts) e devolve a forma canônica ("06/123456").
 */
export const registrationField = (kind: RegistrationKind) => {
  const spec = registrationSpec(kind);
  return z
    .string()
    .trim()
    .transform((v, ctx) => {
      const n = spec.normalize(v);
      if (n === null) {
        ctx.addIssue({ code: "custom", message: spec.invalidMessage });
        return z.NEVER;
      }
      return n;
    });
};
