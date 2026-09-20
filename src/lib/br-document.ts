/**
 * CPF/CNPJ (docs/mind/04-API.md §5). Puro; testado em tests/br-document.test.ts.
 * Guardamos só dígitos; a formatação é de exibição.
 */

const digits = (v: string) => v.replace(/\D/g, "");

function cpfValid(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValid(d: string): boolean {
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

/** "123.456.789-09" → "12345678909"; inválido → null. Vazio → null também (campo opcional). */
export function normalizeDocument(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const d = digits(raw);
  if (!d) return { ok: true, value: null };
  if (d.length === 11) return cpfValid(d) ? { ok: true, value: d } : { ok: false, error: "CPF inválido" };
  if (d.length === 14) return cnpjValid(d) ? { ok: true, value: d } : { ok: false, error: "CNPJ inválido" };
  return { ok: false, error: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)" };
}

export function formatDocument(d: string | null | undefined): string {
  if (!d) return "";
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return d;
}
