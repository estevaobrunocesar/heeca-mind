"use client";

/** Botão de impressão (o navegador gera o PDF). Escondido na própria impressão. */
export function PrintButton({ label = "Imprimir / salvar em PDF", className = "btn-ghost" }: { label?: string; className?: string }) {
  return (
    <button type="button" className={`${className} print:hidden`} onClick={() => window.print()}>
      {label}
    </button>
  );
}
