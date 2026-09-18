"use server";

import { hash } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { sendPasswordResetEmail } from "@/lib/email";
import { slugify } from "@/lib/slug";
import {
  loginSchema,
  registerSchema,
  requestResetSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";

export type FormState = { error?: string; fieldErrors?: Record<string, string[]>; ok?: boolean };

const BCRYPT_COST = 12;

function fieldErrors(err: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }) {
  const flat = err.flatten().fieldErrors;
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(flat)) if (v) out[k] = v;
  return out;
}

// ──────────────────────────────────────────────────────────────
// Cadastro
// ──────────────────────────────────────────────────────────────

/** Encontra um slug livre: "ana-lucia", "ana-lucia-2", "ana-lucia-3"… */
async function findFreeSlug(base: string): Promise<string> {
  const root = slugify(base) || "psicologo";
  const taken = await db.professional.findMany({
    where: { slug: { startsWith: root } },
    select: { slug: true },
  });
  const set = new Set(taken.map((t) => t.slug));
  if (!set.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!set.has(candidate)) return candidate;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { fullName, displayName, crp, email, password } = parsed.data;

  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { fieldErrors: { email: ["Este e-mail já está cadastrado"] } };

  const passwordHash = await hash(password, BCRYPT_COST);
  const slug = await findFreeSlug(displayName);

  // Um cadastro cria o tenant inteiro de um psicólogo autônomo em uma
  // transação: usuário, organização, vínculo, perfil e configurações padrão.
  await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email, passwordHash, name: fullName } });
    const org = await tx.organization.create({ data: { name: displayName, type: "SOLO" } });
    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "OWNER" },
    });
    const professional = await tx.professional.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        displayName,
        fullName,
        crp,
        email,
        slug,
      },
    });
    await tx.scheduleSettings.create({ data: { professionalId: professional.id } });
    await tx.professionalPolicy.create({ data: { professionalId: professional.id } });
  });

  // Loga automaticamente após o cadastro.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────────────────────

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/dashboard" });
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "E-mail ou senha incorretos" };
    }
    throw err; // NEXT_REDIRECT e outros erros de framework sobem
  }
}

// ──────────────────────────────────────────────────────────────
// Recuperação de senha
// ──────────────────────────────────────────────────────────────

const RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordResetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = requestResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { email } = parsed.data;

  const user = await db.user.findUnique({ where: { email }, select: { id: true } });

  // Resposta idêntica exista ou não o usuário — evita enumeração.
  if (user) {
    const token = randomBytes(32).toString("base64url");
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendPasswordResetEmail(email, `${base}/redefinir-senha/${token}`);
  }

  return { ok: true };
}

export async function resetPasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { token, password } = parsed.data;

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "Link inválido ou expirado. Solicite uma nova redefinição." };
  }

  const passwordHash = await hash(password, BCRYPT_COST);
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Invalida outros tokens pendentes do mesmo usuário.
    db.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  redirect("/login?reset=1");
}
