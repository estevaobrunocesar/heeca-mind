import { notFound } from "next/navigation";
import type { NextRequest } from "next/server";
import { ClinicalAccessDenied, openDocument } from "@/lib/clinical";
import { requireActor } from "@/lib/session";

/**
 * Entrega um documento do prontuário ao profissional autorizado.
 *
 * Não existe URL pública para o arquivo: ele sai do storage cifrado, é
 * decifrado aqui, depois de requireClinicalAccess, e registra READ.
 * `?download=1` força "salvar como"; sem ele, PDF/imagem abrem no navegador.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/pacientes/[id]/prontuario/documentos/[docId]">) {
  const { docId } = await ctx.params;
  const actor = await requireActor();

  let doc: Awaited<ReturnType<typeof openDocument>>;
  try {
    doc = await openDocument(actor, docId);
  } catch (e) {
    if (e instanceof ClinicalAccessDenied) return new Response("Acesso restrito ao profissional responsável", { status: 403 });
    throw e;
  }
  if (!doc) notFound();

  const disposition = req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
  const ascii = doc.fileName.replace(/[^\x20-\x7e]/g, "_");
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": doc.contentType,
      "content-length": String(doc.bytes.length),
      "content-disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      // Nunca cachear (é dado clínico) e nunca deixar o conteúdo agir como página desta origem:
      // um PDF com JavaScript embutido roda isolado, sem cookies nem acesso ao app.
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
