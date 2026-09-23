import "dotenv/config";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma/client";
import { signBody, signHs256Jwt } from "../../src/lib/heeca/core";

/**
 * Fixtures do E2E: dados reais no banco local, todos com prefixo `e2e-` (limpos no teardown).
 * Nada aqui passa pelos serviços do app — é montagem de cenário; quem exercita o produto é o teste.
 */

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
export const PASSWORD = "e2e-senha-12345";
export const E2E = "e2e-";
const RUN = process.env.E2E_RUN_ID ?? randomBytes(3).toString("hex");

export type Tenant = { orgId: string; ownerEmail: string; receptionEmail: string; proId: string; slug: string; serviceId: string; patientId: string; patientPhone: string };

/** Organização completa: dono-psicólogo, recepção, serviço, grade seg–sex 09–18, paciente. */
export async function createTenant(tag: string): Promise<Tenant> {
  const id = `${RUN}-${tag.toLowerCase()}`; // e-mails são normalizados em minúsculas no login
  const passwordHash = hashSync(PASSWORD, 4);
  const org = await db.organization.create({ data: { name: `${E2E}Clínica ${tag}`, type: "CLINIC", slug: `${E2E}clinica-${id}` } });
  const owner = await db.user.create({ data: { email: `${E2E}owner-${id}@teste.local`, passwordHash, name: `Dra. E2E ${tag}` } });
  const reception = await db.user.create({ data: { email: `${E2E}recepcao-${id}@teste.local`, passwordHash, name: `Recepção ${tag}` } });
  await db.membership.createMany({ data: [{ userId: owner.id, organizationId: org.id, role: "OWNER" }, { userId: reception.id, organizationId: org.id, role: "RECEPTIONIST" }] });
  const pro = await db.professional.create({ data: { organizationId: org.id, userId: owner.id, displayName: `Dra. E2E ${tag}`, fullName: `Dra. E2E ${tag}`, registrationNumber: "06/123456", slug: `${E2E}dra-${id}`, onlinePlatform: "GOOGLE_MEET", onlineFixedLink: "https://meet.google.com/e2e-test" } });
  await db.scheduleSettings.create({ data: { professionalId: pro.id, minAdvanceHours: 1, confirmationTimeoutHours: 48 } });
  await db.professionalPolicy.create({ data: { professionalId: pro.id, surveyEnabled: true } });
  await db.availabilityRule.createMany({ data: [1, 2, 3, 4, 5].map((weekday) => ({ professionalId: pro.id, weekday, startTime: "09:00", endTime: "18:00" })) });
  const service = await db.service.create({ data: { professionalId: pro.id, name: "Sessão individual", durationMinutes: 50, priceCents: 25000, modality: "HYBRID", patientInstructions: "Chegue 5 minutos antes." } });
  const patientPhone = `+5511${String(90000000 + (parseInt(RUN, 16) % 9000000)).slice(0, 8)}${tag.charCodeAt(0) % 10}`;
  const patient = await db.patient.create({ data: { organizationId: org.id, name: `Paciente E2E ${tag}`, whatsapp: patientPhone, email: `${E2E}paciente-${id}@teste.local` } });
  return { orgId: org.id, ownerEmail: owner.email, receptionEmail: reception.email, proId: pro.id, slug: pro.slug, serviceId: service.id, patientId: patient.id, patientPhone };
}

export async function cleanupAll() {
  await db.organization.deleteMany({ where: { name: { startsWith: E2E } } });
  await db.user.deleteMany({ where: { email: { startsWith: E2E } } });
  // Rate limits por IP/telefone acumulam entre rodadas locais (tudo sai de 127.0.0.1).
  await db.rateLimit.deleteMany({});
}

/**
 * Zera SÓ os contadores de login antes de entrar.
 *
 * `clientIp()` cai para "unknown" quando não há x-forwarded-for, então TODO login da suíte
 * cai no mesmo balde `login:ip` (20 por 15 min): com a suíte crescendo, as últimas specs
 * começam a falhar por limite acumulado das anteriores — esperando /dashboard, sem nada a ver
 * com o cenário que testam. Apagar a tabela inteira resolveria, mas levaria junto os limites
 * de agendamento público, portal e tokens, que os testes precisam ver funcionando de verdade.
 * As chaves são sha256(`${scope}:${identifier}`) — dá para remover exatamente as duas.
 */
async function clearLoginThrottle(email: string) {
  const key = (scope: string, id: string) => createHash("sha256").update(`${scope}:${id}`).digest("hex");
  await db.rateLimit.deleteMany({
    where: { key: { in: [key("login:email", email), key("login:ip", "unknown"), key("login:ip", "127.0.0.1")] } },
  });
}

export async function login(page: Page, email: string) {
  await clearLoginThrottle(email);
  // Trocar de usuário no meio do teste sem limpar os cookies pode deixar a sessão anterior de pé
  // e o teste segue com o ator errado — um teste de permissão passa sem exercitar o papel restrito.
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
}

/** Último token de uma notificação (botão de URL) — o teste lê a fila, como o paciente leria o WhatsApp. */
export async function lastButtonToken(type: "DOCUMENT_REQUEST" | "PORTAL_LOGIN" | "SURVEY" | "FORM_REQUEST", patientId: string): Promise<string> {
  const n = await db.notification.findFirstOrThrow({ where: { type, patientId }, orderBy: { createdAt: "desc" }, select: { payload: true } });
  const p = n.payload as { buttons?: Array<{ type: string; text?: string }> };
  const t = p.buttons?.find((b) => b.type === "url")?.text;
  if (!t) throw new Error(`notificação ${type} sem botão de URL`);
  return t;
}

/** Simula o portal Heeca: assina como ele. */
export const portal = {
  secret: () => process.env.HEECA_PLATFORM_SECRET ?? "",
  headers(rawBody: string) {
    const { ts, sig } = signBody(this.secret(), rawBody);
    return { "Content-Type": "application/json", "X-Heeca-Timestamp": ts, "X-Heeca-Signature": sig };
  },
  entitlement(subscriptionId: string, email: string) {
    return {
      subscriptionId, accountId: `acc_${subscriptionId}`, product: "mind", status: "TRIALING", access: "ok",
      plan: { code: "solo", name: "Solo", features: [], limits: { maxProfessionals: 1 } },
      trialEndsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), currentPeriodEnd: null,
      account: { name: `${E2E}Consultório`, tradeName: null, document: "52998224725", email, phone: "+5511999990000" },
      owner: { name: `${E2E}Profissional SSO`, email },
      segment: "psychology",
    };
  },
  ssoUrl(subscriptionId: string, email: string) {
    const now = Math.floor(Date.now() / 1000);
    const token = signHs256Jwt(this.secret(), { iss: "heeca-portal", aud: "mind", sub: email, name: `${E2E}Profissional SSO`, tenantId: null, subscriptionId, role: "OWNER", jti: randomUUID(), iat: now, exp: now + 60 });
    return `/sso/heeca?token=${token}&next=/dashboard`;
  },
};
