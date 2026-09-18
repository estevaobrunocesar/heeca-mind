import type { NextAuthConfig } from "next-auth";

/**
 * Configuração compartilhada entre o proxy (edge) e o servidor.
 * NÃO importe Prisma ou bcrypt aqui — este arquivo roda no edge runtime.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12h — sessão administrativa; MFA e revogação virão depois
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/agenda") ||
        pathname.startsWith("/pacientes") ||
        pathname.startsWith("/servicos") ||
        pathname.startsWith("/configuracoes") ||
        pathname.startsWith("/financeiro");

      if (isProtected && !isLoggedIn) return false; // redireciona para pages.signIn
      return true;
    },
    jwt({ token, user }) {
      // `user` só vem no login; persistimos o contexto do tenant no token.
      if (user) {
        token.userId = user.id!; // authorize() sempre devolve id
        token.organizationId = user.organizationId;
        token.role = user.role;
        token.professionalId = user.professionalId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId;
      session.user.organizationId = token.organizationId;
      session.user.role = token.role;
      session.user.professionalId = token.professionalId;
      return session;
    },
  },
  providers: [], // preenchido em src/auth.ts
} satisfies NextAuthConfig;
