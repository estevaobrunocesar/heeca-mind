import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Configuração compartilhada entre o proxy (edge) e o servidor.
 * NÃO importe Prisma ou bcrypt aqui — este arquivo roda no edge runtime.
 */

const PROTECTED_PREFIXES = ["/dashboard", "/agenda", "/pacientes", "/servicos", "/configuracoes", "/mensagens", "/financeiro", "/pacotes", "/relatorios", "/bloqueado"];

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12h — sessão administrativa
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

      if (isProtected && !isLoggedIn) return false; // redireciona para pages.signIn

      // Senha ok, segundo fator pendente: só a página do código é permitida.
      if (isLoggedIn && auth?.user.mfaPending && isProtected) {
        return NextResponse.redirect(new URL("/login/mfa", request.nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      // `user` só vem no login; persistimos o contexto do tenant no token.
      if (user) {
        token.userId = user.id!; // authorize() sempre devolve id
        token.organizationId = user.organizationId;
        token.role = user.role;
        token.professionalId = user.professionalId;
        token.sid = user.sid;
        token.mfaPending = user.mfaPending;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.organizationId = token.organizationId;
      session.user.role = token.role;
      session.user.professionalId = token.professionalId;
      session.user.sid = token.sid;
      session.user.mfaPending = token.mfaPending;
      return session;
    },
  },
  providers: [], // preenchido em src/auth.ts
} satisfies NextAuthConfig;
