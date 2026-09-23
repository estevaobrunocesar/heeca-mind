import "server-only";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { slugify } from "@/lib/slug";
import { DEFAULT_REGISTRATION_BY_SEGMENT } from "@/lib/registration";
import { accessStateOf, membershipRoleFor, PRODUCT, verifySignedBody, verifySsoJwt, type Entitlement, type SsoClaims } from "./core";
import { maxProfessionalsFrom } from "./limits";

/**
 * Integração com o portal heeca.com.br (docs/mind/00-DECISAO-E-REUSO.md, 03-FLUXOS.md F1).
 *
 * O portal é dono de conta, plano e cobrança. Aqui:
 *  - `provision`      cria o tenant a partir da assinatura (idempotente por subscriptionId);
 *  - `applyEntitlement` espelha status/plano/acesso em Organization (o gate lê daqui);
 *  - `resolveSsoUser` troca as claims do JWT do portal pelo usuário local.
 *
 * Nada aqui cobra, renova ou suspende por conta própria.
 * Variáveis: HEECA_PLATFORM_SECRET, HEECA_PORTAL_URL.
 */

const secret = () => process.env.HEECA_PLATFORM_SECRET ?? "";
export const platformEnabled = () => secret().length >= 16;
export const portalUrl = () => (process.env.HEECA_PORTAL_URL ?? "https://heeca.com.br").replace(/\/+$/, "");
/** Página do produto no portal — para onde `/cadastro` manda quem chega sem assinatura. */
export const portalProductUrl = () => `${portalUrl()}/produtos/${PRODUCT}`;
export const portalAccountUrl = () => `${portalUrl()}/conta`;
export const portalSsoUrl = (next = "/dashboard") => `${portalUrl()}/sso/${PRODUCT}?next=${encodeURIComponent(next)}`;

export function verifyPortalRequest(rawBody: string, headers: Headers, now = Date.now()) {
  return verifySignedBody(secret(), rawBody, { ts: headers.get("x-heeca-timestamp"), sig: headers.get("x-heeca-signature") }, now);
}

const SEGMENT_MAP: Record<string, "PSYCHOLOGY" | "THERAPY"> = { psychology: "PSYCHOLOGY", psicologia: "PSYCHOLOGY", therapy: "THERAPY", terapias: "THERAPY" };

async function freeProfessionalSlug(base: string) {
  const root = slugify(base) || "profissional";
  const taken = new Set((await db.professional.findMany({ where: { slug: { startsWith: root } }, select: { slug: true } })).map((p) => p.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now()}`;
}

/** Senha impossível de usar: o acesso é pelo SSO; "esqueci a senha" cria uma local se a pessoa quiser. */
const unusablePassword = () => hash(randomUUID(), 10);

function entitlementData(e: Entitlement) {
  return {
    heecaAccountId: e.accountId,
    planCode: e.plan?.code ?? null,
    planFeatures: e.plan?.features ?? [],
    planLimits: (e.plan?.limits ?? {}) as object,
    accessState: accessStateOf(e),
    entitlementSyncedAt: new Date(),
    document: e.account?.document?.replace(/\D/g, "") || undefined,
    contactEmail: e.account?.email || undefined,
    contactPhone: e.account?.phone || undefined,
  };
}

/**
 * Cria organização + dono (+ perfil profissional) a partir do portal.
 * Segunda chamada com o mesmo subscriptionId só reaplica o entitlement e devolve o mesmo tenant
 * (o portal repete chamadas que falharam no job diário de reconciliação).
 */
export async function provision(e: Entitlement): Promise<{ tenantId: string; slug: string | null }> {
  const existing = await db.organization.findUnique({ where: { heecaSubscriptionId: e.subscriptionId }, select: { id: true, professionals: { select: { slug: true }, orderBy: { createdAt: "asc" }, take: 1 } } });
  if (existing) {
    await applyEntitlement(e);
    return { tenantId: existing.id, slug: existing.professionals[0]?.slug ?? null };
  }
  if (!e.owner?.email) throw new Error("owner obrigatório no provision");

  const email = e.owner.email.trim().toLowerCase();
  const ownerName = e.owner.name?.trim() || email;
  const orgName = e.account?.tradeName?.trim() || e.account?.name?.trim() || ownerName;
  const segment = SEGMENT_MAP[(e.segment ?? "").toLowerCase()] ?? "PSYCHOLOGY";
  // "clinic" no portal = administrador sem perfil próprio; qualquer outro segmento é um profissional autônomo.
  const solo = (e.segment ?? "").toLowerCase() !== "clinic";
  const slug = solo ? await freeProfessionalSlug(ownerName) : null;
  const passwordHash = await unusablePassword();

  const result = await db.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: { name: orgName, type: solo ? "SOLO" : "CLINIC", segment, heecaSubscriptionId: e.subscriptionId, ...entitlementData(e) },
    });
    const user = await tx.user.upsert({ where: { email }, update: {}, create: { email, passwordHash, name: ownerName } });
    await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
    if (solo) {
      // Usuário que já tinha perfil em outra organização não ganha um segundo (userId é único).
      const hasProfile = await tx.professional.findUnique({ where: { userId: user.id }, select: { id: true } });
      const pro = await tx.professional.create({
        data: {
          organizationId: org.id,
          userId: hasProfile ? null : user.id,
          displayName: ownerName,
          fullName: ownerName,
          registrationKind: DEFAULT_REGISTRATION_BY_SEGMENT[segment],
          registrationNumber: null,
          email,
          slug: slug!,
        },
      });
      await tx.scheduleSettings.create({ data: { professionalId: pro.id } });
      await tx.professionalPolicy.create({ data: { professionalId: pro.id } });
    }
    return { tenantId: org.id, slug };
  });

  await audit(null, { organizationId: result.tenantId, action: "heeca.provision", entityType: "Organization", entityId: result.tenantId, after: { subscriptionId: e.subscriptionId, plan: e.plan?.code, status: e.status, segment: e.segment ?? null } });
  return result;
}

/** Espelha plano/status/acesso. Lança se a assinatura nunca foi provisionada (o portal registra e refaz). */
export async function applyEntitlement(e: Entitlement) {
  const org = await db.organization.findUnique({ where: { heecaSubscriptionId: e.subscriptionId }, select: { id: true, accessState: true, planCode: true } });
  if (!org) throw new Error("assinatura não provisionada neste produto");
  const data = entitlementData(e);
  await db.organization.update({ where: { id: org.id }, data });
  if (org.accessState !== data.accessState || org.planCode !== data.planCode) {
    await audit(null, { organizationId: org.id, action: "heeca.entitlement", entityType: "Organization", entityId: org.id, before: { accessState: org.accessState, planCode: org.planCode }, after: { accessState: data.accessState, planCode: data.planCode, status: e.status } });
  }
}

export type SsoResolution =
  | { ok: true; user: { id: string; email: string; name: string; organizationId: string; role: "OWNER" | "PROFESSIONAL" | "RECEPTIONIST" | "FINANCE"; professionalId: string | null; mfaEnabled: boolean } }
  | { ok: false; error: string };

/**
 * Valida o JWT do portal, garante uso único do `jti` e devolve o usuário local com vínculo no tenant
 * (cria os dois se for a primeira vez). Quem cria a sessão é o provider `heeca-sso` em src/auth.ts.
 */
export async function resolveSsoUser(token: string): Promise<SsoResolution> {
  const check = verifySsoJwt(secret(), token);
  if (!check.ok) return { ok: false, error: check.error };
  const c: SsoClaims = check.claims;

  // Uso único: a segunda apresentação do mesmo jti (replay) cai aqui. A janela cobre exp + tolerância.
  const once = await rateLimit({ scope: "sso:jti", limit: 1, windowSeconds: 10 * 60 }, c.jti);
  if (!once.ok) return { ok: false, error: "token já utilizado" };

  const org = c.subscriptionId
    ? await db.organization.findUnique({ where: { heecaSubscriptionId: c.subscriptionId }, select: { id: true } })
    : c.tenantId ? await db.organization.findUnique({ where: { id: c.tenantId }, select: { id: true } }) : null;
  if (!org) return { ok: false, error: "conta ainda não provisionada neste produto" };

  const passwordHash = await unusablePassword();
  const user = await db.user.upsert({ where: { email: c.email }, update: {}, create: { email: c.email, passwordHash, name: c.name }, include: { professional: { select: { id: true } } } });
  if (!user.isActive) return { ok: false, error: "usuário desativado" };

  let membership = await db.membership.findUnique({ where: { userId_organizationId: { userId: user.id, organizationId: org.id } } });
  if (!membership) {
    membership = await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: membershipRoleFor(c.role) } });
    await audit(null, { organizationId: org.id, action: "heeca.sso_membership", entityType: "Membership", entityId: membership.id, after: { email: c.email, portalRole: c.role, role: membership.role } });
  }

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, organizationId: org.id, role: membership.role, professionalId: user.professional?.id ?? null, mfaEnabled: user.mfaEnabled },
  };
}

// ──────────────────────────────────────────────────────────────
// Vagas de profissional (limite do plano)
// ──────────────────────────────────────────────────────────────

/**
 * Vagas do plano: o teto espelhado do entitlement e quantos profissionais ATIVOS já ocupam.
 * `max: null` = plano sem limite. Desativar um profissional devolve a vaga.
 */
export async function professionalSeats(organizationId: string): Promise<{ max: number | null; active: number }> {
  const [org, active] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { planLimits: true } }),
    db.professional.count({ where: { organizationId, isActive: true } }),
  ]);
  return { max: maxProfessionalsFrom(org.planLimits), active };
}
