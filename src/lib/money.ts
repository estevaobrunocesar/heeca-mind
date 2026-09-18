/** Formata centavos como moeda brasileira: 25000 -> "R$ 250,00" */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Centavos -> string para input: 25000 -> "250,00" */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/**
 * Converte entrada humana em centavos. Aceita "250", "250,00", "1.250,50",
 * "R$ 250". Retorna null se nao for um valor valido.
 */
export function parseBRLToCents(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  // Se tem virgula, ela e o separador decimal e pontos sao milhar.
  // Se nao tem virgula mas tem um unico ponto seguido de 1-2 digitos, tratamos como decimal.
  let normalized: string;
  if (cleaned.includes(",")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d+\.\d{1,2}$/.test(cleaned)) {
    normalized = cleaned;
  } else {
    normalized = cleaned.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}
