import { expect, test } from "@playwright/test";
import { db, E2E, portal } from "./fixtures";

/**
 * Jornada 1 — Onboarding via portal (F1): provision assinado → SSO → dashboard → criar serviço.
 * Pré-requisito: HEECA_PLATFORM_SECRET no .env (o mesmo que o app lê).
 */
test.describe("onboarding via portal", () => {
  test.skip(!portal.secret(), "HEECA_PLATFORM_SECRET ausente no .env");
  const sub = `${E2E}sub-${Date.now()}`;
  const email = `${E2E}sso-${Date.now()}@teste.local`;

  test("provision idempotente → SSO cria sessão → serviço criado", async ({ page, request }) => {
    const body = JSON.stringify(portal.entitlement(sub, email));
    const r1 = await request.post("/api/heeca/provision", { headers: portal.headers(body), data: body });
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    const r2 = await request.post("/api/heeca/provision", { headers: portal.headers(body), data: body });
    expect((await r2.json()).tenantId, "segunda chamada devolve o mesmo tenant").toBe(j1.tenantId);

    const unsigned = await request.post("/api/heeca/provision", { data: body });
    expect(unsigned.status(), "sem assinatura → 401").toBe(401);

    const sso = portal.ssoUrl(sub, email);
    await page.goto(sso);
    await expect(page).toHaveURL(/\/dashboard/);
    // O painel saúda pelo primeiro nome ("Bom dia, Fulano! 👋"); "Início" ficou só no <title>.
    await expect(page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), / })).toBeVisible();
    await expect(page).toHaveTitle(/^Início/);

    // Replay do mesmo link cai no login com erro.
    const replay = await request.get(sso, { maxRedirects: 0 });
    expect(replay.headers()["location"] ?? "").toContain("/login?sso_error=");

    await page.goto("/servicos/novo");
    await page.getByLabel("Nome do atendimento").fill("Sessão online");
    await page.getByLabel("Duração (minutos)").fill("50");
    await page.getByLabel("Valor (R$)").fill("200,00");
    await page.getByLabel("Modalidade").selectOption("ONLINE");
    await page.getByRole("button", { name: /Criar|Salvar/ }).click();
    await expect(page).toHaveURL(/\/servicos$/);
    await expect(page.getByText("Sessão online")).toBeVisible();

    const org = await db.organization.findUnique({ where: { heecaSubscriptionId: sub }, select: { accessState: true, segment: true } });
    expect(org?.accessState).toBe("OK");
    expect(org?.segment).toBe("PSYCHOLOGY");
  });
});
