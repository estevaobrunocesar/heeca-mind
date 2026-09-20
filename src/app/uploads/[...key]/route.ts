import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { IMAGE_MIME, sniffImage } from "@/lib/image";

/**
 * Serve os arquivos públicos do driver local de storage (fotos de perfil, logos).
 *
 * Por quê existe: em produção o Next só serve `public/` para arquivos que existiam no
 * momento do build; o que é gravado depois (todo upload) responde 404. Este handler
 * cobre exatamente esses arquivos. Em dev e para arquivos pré-build, o estático do
 * Next continua respondendo antes de chegar aqui.
 *
 * Só imagens: é tudo que o `put()` público grava. Qualquer outra coisa → 404, mesmo
 * que exista no disco. Chaves são únicas por upload, então o cache pode ser longo.
 */
const ROOT = path.join(process.cwd(), "public", "uploads");

export async function GET(_req: Request, ctx: RouteContext<"/uploads/[...key]">) {
  const { key } = await ctx.params;
  const rel = key.join("/");
  if (!rel || rel.includes("..") || rel.includes("\0")) return new NextResponse(null, { status: 404 });
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return new NextResponse(null, { status: 404 });

  let buf: Buffer;
  try {
    buf = await readFile(file);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  const kind = sniffImage(buf);
  if (!kind) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": IMAGE_MIME[kind],
      "Content-Length": String(buf.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
