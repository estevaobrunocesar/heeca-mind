import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";
import { db } from "./lib/db";

const credentialsSchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: membership.organizationId,
          role: membership.role,
          professionalId: user.professional?.id ?? null,
        };
      },
    }),
  ],
});
