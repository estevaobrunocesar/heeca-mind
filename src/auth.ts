import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";
import { createUserSession } from "./lib/sessions";
import { resolveSsoUser } from "./lib/heeca/service";

const credentialsSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Versão Node do callback: além do login, trata o `update()` disparado
     * depois do segundo fator. Só libera `mfaPending` se existir a prova no
     * banco para este `sid` — um update vindo do cliente sem essa linha não
     * muda nada.
     */
    async jwt({ token, user, trigger, session }) {
      token = authConfig.callbacks.jwt({ token, user }) as typeof token;
      const wantsRelease = (session as { user?: { mfaPending?: boolean } } | undefined)?.user?.mfaPending === false;
      if (trigger === "update" && wantsRelease && token.mfaPending && token.sid) {
        const proof = await db.mfaVerification.findUnique({ where: { sid: token.sid } });
        if (proof && proof.userId === token.userId) {
          token.mfaPending = false;
          await db.mfaVerification.delete({ where: { sid: token.sid } }).catch(() => {});
        }
      }
      return token;
    },
  },
  providers: [
    /**
     * SSO da conta Heeca: o portal emite um JWT de 60 s e /sso/heeca o entrega aqui.
     * Passa pelo mesmo callback jwt, cria a mesma user_sessions e respeita o MFA local —
     * é um login como qualquer outro, só que com o portal atestando o e-mail.
     */
    Credentials({
      id: "heeca-sso",
      credentials: { token: {} },
      async authorize(raw, request) {
        const token = typeof raw?.token === "string" ? raw.token : "";
        if (!token) return null;
        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const userAgent = request.headers.get("user-agent") ?? null;
        const r = await resolveSsoUser(token);
        await db.accessLog.create({ data: { userId: r.ok ? r.user.id : null, email: r.ok ? r.user.email : "sso", success: r.ok, ip, userAgent } });
        if (!r.ok) return null;
        await db.user.update({ where: { id: r.user.id }, data: { lastLoginAt: new Date() } });
        const sid = randomUUID();
        await createUserSession({ sid, userId: r.user.id, ip, userAgent });
        return { id: r.user.id, email: r.user.email, name: r.user.name, organizationId: r.user.organizationId, role: r.user.role, professionalId: r.user.professionalId, sid, mfaPending: r.user.mfaEnabled };
      },
    }),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const userAgent = request.headers.get("user-agent") ?? null;

        const user = await db.user.findUnique({
          where: { email },
          include: {
            memberships: { take: 1, orderBy: { createdAt: "asc" } },
            professional: { select: { id: true } },
          },
        });

        // Comparação sempre executada (mesmo com usuário inexistente) para
        // não revelar por tempo de resposta se o e-mail está cadastrado.
        const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
        const ok = (await compare(password, hash)) && !!user && user.isActive;

        await db.accessLog.create({
          data: { userId: user?.id ?? null, email, success: ok, ip, userAgent },
        });

        if (!ok || !user) return null;

        const membership = user.memberships[0];
        if (!membership) return null; // usuário sem organização não entra

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

        const sid = randomUUID();
        await createUserSession({ sid, userId: user.id, ip, userAgent });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: membership.organizationId,
          role: membership.role,
          professionalId: user.professional?.id ?? null,
          sid,
          mfaPending: user.mfaEnabled,
        };
      },
    }),
  ],
});
