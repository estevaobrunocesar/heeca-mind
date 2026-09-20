import { expect, test } from "@playwright/test";
import { createTenant, db, lastButtonToken, login, type Tenant } from "./fixtures";

/** Jornada 4 — Documento: instalar modelos → enviar da ficha → aceite pelo link → registro. */
let t: Tenant;
test.beforeAll(async () => {
  t = await createTenant("doc");
});

test("termo enviado, nome errado recusado, aceite registrado com hash", async ({ page, context }) => {
  await login(page, t.ownerEmail);
  await page.goto("/configuracoes/documentos");
  await page.getByRole("button", { name: "Instalar modelos iniciais" }).click();
  await expect(page.getByText("Termo de consentimento para atendimento psicológico")).toBeVisible();

  await page.goto(`/pacientes/${t.patientId}`);
  const select = page.getByLabel("Enviar documento");
  const termo = await select.locator("option", { hasText: "Termo de consentimento" }).getAttribute("value");
  await select.selectOption(termo!);
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Documento enviado por WhatsApp.")).toBeVisible();
  const token = await lastButtonToken("DOCUMENT_REQUEST", t.patientId);

  // Paciente: sem sessão do app (contexto novo)
  const patient = await context.browser()!.newContext({ locale: "pt-BR" });
  const pp = await patient.newPage();
  await pp.goto(`/documento/${token}`);
  await expect(pp.getByText("Paciente E2E doc").first()).toBeVisible(); // {{paciente.nome}} renderizado no snapshot
  await pp.getByLabel("Seu nome completo").fill("Fulano Errado");
  await pp.getByLabel(/Li o documento/).check();
  await pp.getByRole("button", { name: "Aceitar" }).click();
  await expect(pp.getByText("Digite seu nome completo como está no cadastro.")).toBeVisible();

  await pp.getByLabel("Seu nome completo").fill("PACIENTE E2E DOC");
  await pp.getByLabel(/Li o documento/).check();
  await pp.getByRole("button", { name: "Aceitar" }).click();
  await expect(pp.getByText("Aceito eletronicamente")).toBeVisible();
  await expect(pp.getByText(/Hash do documento: [0-9a-f]{64}/)).toBeVisible();
  await patient.close();

  const r = await db.documentRequest.findFirstOrThrow({ where: { patientId: t.patientId }, orderBy: { sentAt: "desc" } });
  expect(r.status).toBe("ACCEPTED");
  expect(r.acceptanceHash).toHaveLength(64);
  expect(r.acceptName).toBe("PACIENTE E2E DOC");

  // Registro interno + e-mail ao profissional na fila
  await page.goto(`/pacientes/${t.patientId}/documentos/${r.id}`);
  await expect(page.getByText("Hash do aceite", { exact: true })).toBeVisible();
  const mail = await db.notification.findFirst({ where: { type: "PRO_DOCUMENT_ACCEPTED", patientId: t.patientId } });
  expect(mail).toBeTruthy();
});
