import { expect, test } from "@playwright/test";
import { createTenant, db, login, type Tenant } from "./fixtures";

/** Clínica — logo: só o responsável envia; aparece na página pública (CLINIC), no portal e some ao remover. */
let t: Tenant;
test.beforeAll(async () => {
  t = await createTenant("logo");
});

// PNG 1×1 válido: o uploader decodifica com createImageBitmap e reenvia como PNG.
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

test("responsável envia o logo, ele aparece fora do app, e a remoção limpa tudo", async ({ page }) => {
  await login(page, t.ownerEmail);
  await page.goto("/configuracoes/clinica");
  await expect(page.getByRole("heading", { name: "Logo" })).toBeVisible();
  await expect(page.getByText("Sem logo")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1X1 });
  await expect(page.getByRole("button", { name: "Trocar logo" })).toBeVisible();
  const org = await db.organization.findUniqueOrThrow({ where: { id: t.orgId }, select: { logoUrl: true, logoKey: true } });
  expect(org.logoKey).toMatch(new RegExp(`organizations/${t.orgId}/logo-\\d+\\.png$`));
  expect(org.logoUrl).toBeTruthy();

  // Página pública (org é CLINIC) e portal mostram o logo; o arquivo é servido.
  await page.goto(`/agendar/${t.slug}`);
  const publicLogo = page.locator(`img[src="${org.logoUrl}"]`);
  await expect(publicLogo).toBeVisible();
  const served = await page.request.get(org.logoUrl!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toContain("image/png");
  await page.goto(`/portal/${t.slug}`);
  await expect(page.locator(`img[src="${org.logoUrl}"]`)).toBeVisible();

  // Recepção não consegue trocar (tela nem oferece).
  await login(page, t.receptionEmail);
  await page.goto("/configuracoes/clinica");
  await expect(page.getByText("Só o responsável pela conta edita os dados da clínica.")).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);

  // Remoção pelo responsável
  await login(page, t.ownerEmail);
  await page.goto("/configuracoes/clinica");
  await page.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Sem logo")).toBeVisible();
  const after = await db.organization.findUniqueOrThrow({ where: { id: t.orgId }, select: { logoUrl: true, logoKey: true } });
  expect(after).toEqual({ logoUrl: null, logoKey: null });
  expect((await page.request.get(org.logoUrl!)).status()).toBe(404);
  const log = await db.auditLog.findMany({ where: { organizationId: t.orgId, action: { in: ["organization.logo", "organization.logo_remove"] } }, select: { action: true } });
  expect(log.map((l) => l.action).sort()).toEqual(["organization.logo", "organization.logo_remove"]);
});
