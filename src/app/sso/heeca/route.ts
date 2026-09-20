import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { safeNextPath } from "@/lib/heeca/core";
import { platformEnabled } from "@/lib/heeca/service";

/**
 * Portal → navegador → Mind: troca o JWT de 60 s por uma sessão local.
 * A validação do token, o uso único do jti e a criação do usuário/vínculo estão no provider
 * `heeca-sso` (src/auth.ts → resolveSsoUser). Aqui só orquestramos redirecionamentos.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Atrás do proxy, req.url traz a origem interna do container: redirects usam a URL pública.
  const origin = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/+$/, "");
  const fail = (msg: string) => NextResponse.redirect(new URL(`/login?sso_error=${encodeURIComponent(msg)}`, origin));
  if (!platformEnabled()) return fail("Login pela conta Heeca não está ativado neste ambiente.");
  const token = url.searchParams.get("token");
  if (!token) return fail("Token ausente.");
  const next = safeNextPath(url.searchParams.get("next"));
  try {
    // redirectTo passa pelo callback `redirect` do Auth.js e pela checagem de MFA do proxy.
    await signIn("heeca-sso", { token, redirectTo: next });
  } catch (e) {
    if (e instanceof AuthError) return fail("Não foi possível entrar pela conta Heeca. Abra o produto de novo pelo portal.");
    throw e; // NEXT_REDIRECT: é o caminho feliz
  }
  return NextResponse.redirect(new URL(next, origin));
}
