"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { revokeAllSessions } from "@/lib/sessions";
import { clinicSchema, inviteSchema, ROLE_LABEL } from "@/lib/validation/team";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function owner() {
  const actor = await requireActor();
  if (!canManageMembers(actor)) throw new Error("Só o responsável gerencia a equipe");
  return actor;
}

export async function updateClinicAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await owner();
  const parsed = clinicSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { name, slug } = parsed.data;

  if (slug) {
    const taken = await db.organization.findFirst({ where: { slug, id: { not: actor.organizationId } }, select: { id: true } });
    if (taken) return { fieldErrors: { slug: ["Este endereço já está em uso"] }, values: formValues(formData) };
  }
  const before = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true, slug: true, type: true } });
  const after = await db.organization.update({ where: { id: actor.organizationId }, data: { name, slug, type: "CLINIC" } });
  await audit(actor, { organizationId: actor.organizationId, action: "organization.update", entityType: "Organization", entityId: actor.organizationId, before, after: { name: after.name, slug: after.slug, type: after.type } });
  revalidatePath("/configuracoes/equipe");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function inviteMemberAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await owner();
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { email, role } = parsed.data;

  const existing = await db.user.findUnique({ where: { email }, select: { id: true, memberships: { where: { organizationId: actor.organizationId }, select: { id: true } } } });
  if (existing?.memberships.length) return { fieldErrors: { email: ["Esta pessoa já faz parte da equipe"] }, values: formValues(formData) };
  if (existing) return { fieldErrors: { email: ["Este e-mail já tem conta em outra organização. Peça para usar outro e-mail."] }, values: formValues(formData) };

  const pending = await db.invitation.findFirst({ where: { organizationId: actor.organizationId, email, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { id: true } });
  if (pending) return { fieldErrors: { email: ["Já existe um convite pendente para este e-mail"] }, values: formValues(formData) };

  const token = randomBytes(32).toString("base64url");
  const invitation = await db.invitation.create({
    data: {
      organizationId: actor.organizationId,
      email,
      role,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedById: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { name: true } });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  await sendEmail({
    to: email,
    subject: `Convite para ${org.name} — Heeca Mind`,
    text:
      `Você foi convidado(a) para fazer parte de ${org.name} no Heeca Mind como ${ROLE_LABEL[role].toLowerCase()}.\n\n` +
      `Aceite o convite (válido por 7 dias):\n${base}/convite/${token}\n`,
  });

  await audit(actor, { organizationId: actor.organizationId, action: "member.invite", entityType: "Invitation", entityId: invitation.id, after: { email, role } });
  revalidatePath("/configuracoes/equipe");
  return { ok: true };
}

export async function cancelInviteAction(invitationId: string) {
  const actor = await owner();
  const inv = await db.invitation.findFirst({ where: { id: invitationId, organizationId: actor.organizationId, acceptedAt: null } });
  if (!inv) return;
  await db.invitation.delete({ where: { id: invitationId } });
  await audit(actor, { organizationId: actor.organizationId, action: "member.invite_cancel", entityType: "Invitation", entityId: invitationId, before: { email: inv.email } });
  revalidatePath("/configuracoes/equipe");
}

export async function changeRoleAction(membershipId: string, role: "PROFESSIONAL" | "RECEPTIONIST" | "FINANCE" | "OWNER") {
  const actor = await owner();
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId }, include: { user: { select: { professional: { select: { id: true } } } } } });
  if (!m) return;
  if (m.userId === actor.userId) return; // não rebaixa a si mesmo
  if (role === "PROFESSIONAL" && !m.user.professional) return; // sem perfil não vira psicólogo
  await db.membership.update({ where: { id: membershipId }, data: { role } });
  await revokeAllSessions(m.userId, "admin"); // novo papel só vale com novo login
  await audit(actor, { organizationId: actor.organizationId, action: "member.role", entityType: "Membership", entityId: membershipId, before: { role: m.role }, after: { role } });
  revalidatePath("/configuracoes/equipe");
}

/**
 * Remove da equipe: apaga o vínculo (a pessoa não entra mais), desliga o
 * perfil profissional (some da página da clínica, agenda preservada) e
 * derruba as sessões.
 */
export async function removeMemberAction(membershipId: string): Promise<{ error?: string }> {
  const actor = await owner();
  const m = await db.membership.findFirst({ where: { id: membershipId, organizationId: actor.organizationId }, include: { user: { select: { professional: { select: { id: true } } } } } });
  if (!m) return { error: "Membro não encontrado." };
  if (m.userId === actor.userId) return { error: "Você não pode remover a si mesmo." };

  const proId = m.user.professional?.id;
  if (proId) {
    const upcoming = await db.appointment.count({ where: { professionalId: proId, startsAt: { gt: new Date() }, status: { in: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED", "AWAITING_PAYMENT"] } } });
    if (upcoming > 0) return { error: `Há ${upcoming} sessão(ões) futura(s) na agenda desta pessoa. Cancele ou transfira antes.` };
  }

  await db.$transaction([
    db.membership.delete({ where: { id: membershipId } }),
    ...(proId ? [db.professional.update({ where: { id: proId }, data: { isActive: false } })] : []),
  ]);
  await revokeAllSessions(m.userId, "admin");
  await audit(actor, { organizationId: actor.organizationId, action: "member.remove", entityType: "Membership", entityId: membershipId, before: { userId: m.userId, role: m.role } });
  revalidatePath("/configuracoes/equipe");
  revalidatePath("/", "layout");
  return {};
}
