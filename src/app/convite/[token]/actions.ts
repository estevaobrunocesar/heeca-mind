"use server";

import { hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { signIn } from "@/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { slugify } from "@/lib/slug";
import { acceptInviteSchema } from "@/lib/validation/team";

function hashToken(t: string) {
  return createHash("sha256").update(t).digest("hex");
}

export async function findInvitation(token: string) {
  if (token.length < 20) return null;
  return db.invitation.findFirst({
    where: { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { organization: { select: { id: true, name: true } } },
  });
}

async function freeSlug(base: string) {
  const root = slugify(base) || "psicologo";
  const taken = new Set((await db.professional.findMany({ where: { slug: { startsWith: root } }, select: { slug: true } })).map((t) => t.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now()}`;
}

/**
 * Aceite: cria usuário + vínculo (+ perfil profissional) numa transação,
 * marca o convite como usado e loga. A organização vira CLINIC no primeiro
 * aceite — um consultório que convida alguém passou a ser uma equipe.
 */
export async function acceptInviteAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = acceptInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const inv = await findInvitation(d.token);
  if (!inv) return { error: "Convite inválido ou expirado. Peça um novo ao responsável." };

  const fieldErrors: Record<string, string[]> = {};
  let crp: string | null = null;
  if (inv.role === "PROFESSIONAL") {
    if (d.displayName.length < 2) fieldErrors.displayName = ["Informe como quer ser chamado(a)"];
    const digits = d.crp.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 8) fieldErrors.crp = ["CRP inválido"];
    else crp = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, values: formValues(formData) };

  if (await db.user.findUnique({ where: { email: inv.email }, select: { id: true } })) {
    return { error: "Já existe uma conta com este e-mail." };
  }

  const passwordHash = await hash(d.password, 12);
  const slug = inv.role === "PROFESSIONAL" ? await freeSlug(d.displayName) : null;

  const userId = await db.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: inv.email, passwordHash, name: d.fullName } });
    await tx.membership.create({ data: { userId: user.id, organizationId: inv.organizationId, role: inv.role } });
    if (inv.role === "PROFESSIONAL") {
      const pro = await tx.professional.create({
        data: { organizationId: inv.organizationId, userId: user.id, displayName: d.displayName, fullName: d.fullName, crp: crp!, email: inv.email, slug: slug! },
      });
      await tx.scheduleSettings.create({ data: { professionalId: pro.id } });
      await tx.professionalPolicy.create({ data: { professionalId: pro.id } });
    }
    await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    await tx.organization.update({ where: { id: inv.organizationId }, data: { type: "CLINIC" } });
    return user.id;
  });

  await audit({ userId, organizationId: inv.organizationId, role: inv.role, professionalId: null, activeProfessionalId: null }, {
    organizationId: inv.organizationId,
    action: "member.join",
    entityType: "Membership",
    entityId: userId,
    after: { role: inv.role, invitationId: inv.id },
  });

  await signIn("credentials", { email: inv.email, password: d.password, redirectTo: "/dashboard" });
  return { ok: true };
}
