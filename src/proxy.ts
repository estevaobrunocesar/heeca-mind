import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Next.js 16: proxy.ts substitui middleware.ts. Roda no edge — por isso usa
// apenas authConfig (sem Prisma). A regra de quais rotas sao protegidas esta
// em authConfig.callbacks.authorized.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|agendar|confirmar|sessao|convite|clinica|formulario|documento|sso).*)"],
};
