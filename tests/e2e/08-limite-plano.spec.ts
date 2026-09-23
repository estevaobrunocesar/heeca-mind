import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createTenant, db, login, type Tenant } from "./fixtures";

/**
 * Limite de profissionais do plano (entitlement `plan.limits.maxProfessionals`).
 * Regra de produto: o convite é recusado no ato do responsável; quem já foi autorizado
 * nunca é barrado — entra com o perfil desativado. Só ativos ocupam vaga.
 */
let t: Tenant;
test.beforeAll(async () => {
  t = await createTenant("limite");
});

async function setPlan(maxProfessionals: number | null) {
  await db.organization.update({
    where: { id: t.orgId },
    data: { planLimits: maxProfessionals === null ? {} : { maxProfessionals } },
  });
}

test("plano Solo recusa o convite; desativar libera a vaga; sem limite não barra", async ({ page }) => {
  await login(page, t.ownerEmail);

  // Solo: 1 vaga, já ocupada pela dona da conta.
  await setPlan(1);
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText(/Profissionais:\s*1 de 1 do seu plano/)).toBeVisible();
  await page.getByLabel("E-mail").fill("e2e-sem-vaga@teste.local");
  await page.getByLabel("Papel", { exact: true }).selectOption("PROFESSIONAL");
  await page.getByRole("button", { name: "Convidar" }).click();
  // A recusa aparece no formulário; o contador acima repete a instrução — daí escopar no form
  // (getByRole("alert") também casaria com o anunciador de rota do Next).
  const inviteForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Convidar" }) });
  await expect(inviteForm.getByText(/Seu plano inclui 1 profissional\./)).toBeVisible();
  await expect(inviteForm.getByText(/remova um profissional da equipe[\s\S]*mude de plano/)).toBeVisible();
  expect(await db.invitation.count({ where: { organizationId: t.orgId, email: "e2e-sem-vaga@teste.local" } })).toBe(0);

  // Recepção não ocupa vaga de profissional: o mesmo plano aceita.
  await page.getByLabel("E-mail").fill("e2e-recepcao-extra@teste.local");
  await page.getByLabel("Papel", { exact: true }).selectOption("RECEPTIONIST");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();

  // Plano com 2 vagas: o convite de profissional passa.
  await setPlan(2);
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText(/Profissionais:\s*1 de 2 do seu plano/)).toBeVisible();
  await page.getByLabel("E-mail").fill("e2e-com-vaga@teste.local");
  await page.getByLabel("Papel", { exact: true }).selectOption("PROFESSIONAL");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();

  // Sem limite no plano: nem contador, nem recusa.
  await setPlan(null);
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText(/do seu plano/)).toHaveCount(0);
  await page.getByLabel("E-mail").fill("e2e-ilimitado@teste.local");
  await page.getByLabel("Papel", { exact: true }).selectOption("PROFESSIONAL");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();
});

test("quem já foi convidado entra mesmo sem vaga — com o perfil desativado", async ({ page }) => {
  const org = await createTenant("aceite");
  // Convite emitido quando ainda havia vaga; a vaga sumiu antes do aceite (plano rebaixado para 1).
  const token = randomBytes(32).toString("base64url");
  const email = `e2e-convidado-${Date.now()}@teste.local`;
  const owner = await db.user.findUniqueOrThrow({ where: { email: org.ownerEmail }, select: { id: true } });
  await db.invitation.create({
    data: {
      organizationId: org.orgId,
      email,
      role: "PROFESSIONAL",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedById: owner.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
  await db.organization.update({ where: { id: org.orgId }, data: { planLimits: { maxProfessionals: 1 } } });

  await page.goto(`/convite/${token}`);
  await page.getByLabel("Nome completo").fill("Carlos Convidado E2E");
  await page.getByLabel("Nome profissional").fill("Dr. Carlos E2E");
  await page.getByLabel("CRP").fill("06/654321");
  await page.getByLabel("Crie uma senha").fill("e2e-senha-12345");
  await page.getByRole("button", { name: "Aceitar e entrar" }).click();

  // Entrou (não foi barrado) …
  await expect(page).toHaveURL(/\/dashboard/);
  // … mas o perfil nasceu desativado: quem ativa é o responsável.
  const pro = await db.professional.findFirstOrThrow({ where: { organizationId: org.orgId, email } });
  expect(pro.isActive, "sem vaga, o perfil nasce desativado").toBe(false);
  const log = await db.auditLog.findFirstOrThrow({ where: { organizationId: org.orgId, action: "member.join" } });
  expect((log.after as { proInactive?: boolean }).proInactive).toBe(true);
});

test("profissional desativado devolve a vaga", async ({ page }) => {
  const other = await createTenant("vaga");
  await db.professional.create({
    data: { organizationId: other.orgId, displayName: "Dra. Segunda", fullName: "Dra. Segunda", registrationNumber: "06/999999", slug: `e2e-segunda-${Date.now()}`, isActive: true },
  });
  await db.organization.update({ where: { id: other.orgId }, data: { planLimits: { maxProfessionals: 2 } } });

  await login(page, other.ownerEmail);
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText(/Profissionais:\s*2 de 2 do seu plano/)).toBeVisible();

  await db.professional.updateMany({ where: { organizationId: other.orgId, displayName: "Dra. Segunda" }, data: { isActive: false } });
  await page.goto("/configuracoes/equipe");
  await expect(page.getByText(/Profissionais:\s*1 de 2 do seu plano/)).toBeVisible();
  await page.getByLabel("E-mail").fill("e2e-vaga-livre@teste.local");
  await page.getByLabel("Papel", { exact: true }).selectOption("PROFESSIONAL");
  await page.getByRole("button", { name: "Convidar" }).click();
  await expect(page.getByText("Convite enviado.")).toBeVisible();
});
