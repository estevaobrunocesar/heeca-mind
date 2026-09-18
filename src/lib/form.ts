/**
 * Utilitarios para Server Actions com useActionState.
 *
 * O React 19 reseta o <form> apos qualquer action. Para nao perder o que o
 * usuario digitou quando a validacao falha, a action devolve `values` e o
 * formulario os usa como defaultValue.
 */

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  /** Valores submetidos, devolvidos apenas em caso de erro. */
  values?: Record<string, string>;
  ok?: boolean;
};

const SECRET_FIELD = /password|senha|token/i;

/**
 * Extrai apenas os campos string do FormData (ignora arquivos).
 * Campos de senha/token nunca voltam ao cliente: o usuario redigita.
 */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string" && !SECRET_FIELD.test(k)) out[k] = v;
  }
  return out;
}

export function fieldErrors(err: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(err.flatten().fieldErrors)) if (v) out[k] = v;
  return out;
}

/** Estado de erro de validacao padrao: erros por campo + valores para repovoar. */
export function invalid(
  err: Parameters<typeof fieldErrors>[0],
  formData: FormData,
): FormState {
  return { fieldErrors: fieldErrors(err), values: formValues(formData) };
}
