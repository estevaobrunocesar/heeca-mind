import { IMAGE_MIME, sniffImage } from "./image";

/**
 * Tipos aceitos como documento clínico, identificados pelo conteúdo (magic
 * bytes) — extensão e Content-Type vêm do cliente e mentem.
 *
 * PDF e imagens só. Sem Office (macro), sem SVG (script), sem HTML. Um
 * documento .docx precisa ser exportado em PDF antes de anexar.
 */

export const MAX_DOCUMENT_BYTES = 8_000_000; // 8 MB — um PDF escaneado de ~20 páginas

export type DocumentKind = "pdf" | "jpeg" | "png" | "webp";

export const DOCUMENT_MIME: Record<DocumentKind, string> = { pdf: "application/pdf", ...IMAGE_MIME };
export const DOCUMENT_EXT: Record<DocumentKind, string> = { pdf: "pdf", jpeg: "jpg", png: "png", webp: "webp" };

export function sniffDocument(buf: Buffer): DocumentKind | null {
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "pdf";
  return sniffImage(buf);
}

/** Nome de arquivo seguro para Content-Disposition: sem caminho, sem controle, sem aspas. */
export function safeFileName(name: string, fallbackExt: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\x00-\x1f"\\]/g, "").trim().slice(0, 120);
  if (!cleaned || cleaned === "." || cleaned === "..") return `documento.${fallbackExt}`;
  return /\.[a-z0-9]{2,5}$/i.test(cleaned) ? cleaned : `${cleaned}.${fallbackExt}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
