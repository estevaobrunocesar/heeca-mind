import { expect, test } from "@playwright/test";
import { createTenant, db, login, type Tenant } from "./fixtures";

/**
 * Negativos — o que NÃO pode acontecer: recepção lendo prontuário, tenant B vendo dados do A,
 * link de documento inválido, rota pública de reagendamento sem sessão do portal.
 */
let a: Tenant;
let b: Tenant;
test.beforeAll(async () => {
  a = await createTenant("negA");
  b = await createTenant("negB");
});

test("recepção não vê prontuário (só a tela de acesso restrito)", async ({ page }) => {
  await login(page, a.receptionEmail);
  await page.goto(`/pacientes/${a.patientId}`);
  await expect(page.getByRole("heading", { name: `Paciente E2E negA` })).toBeVisible();
  await page.goto(`/pacientes/${a.patientId}/prontuario`);
  await expect(page.getByText("Acesso restrito ao profissional responsável")).toBeVisible();
  const reception = await db.user.findUniqueOrThrow({ where: { email: a.receptionEmail }, select: { id: true } });
  const log = await db.clinicalAccessLog.count({ where: { userId: reception.id } });
  expect(log, "sem escopo, nada é descriptografado nem logado como acesso").toBe(0);
});

test("usuário do tenant B não enxerga paciente, sessão nem exportação do tenant A", async ({ page, request }) => {
  await login(page, b.ownerEmail);
  const r1 = await page.goto(`/pacientes/${a.patientId}`);
  expect(r1?.status()).toBe(404);
  const r2 = await page.goto(`/pacientes/${a.patientId}/prontuario`);
  expect(r2?.status()).toBe(404);

  const appt = await db.appointment.create({ data: { organizationId: a.orgId, professionalId: a.proId, patientId: a.patientId, serviceId: a.serviceId, serviceNameSnapshot: "Sessão individual", priceCents: 25000, durationMinutes: 50, modality: "ONLINE", status: "CONFIRMED", startsAt: new Date(Date.now() + 5 * 86_400_000), endsAt: new Date(Date.now() + 5 * 86_400_000 + 3_000_000) } });
  const r3 = await page.goto(`/agenda/${appt.id}`);
  expect(r3?.status()).toBe(404);

  // Rota de exportação (route handler) usa a mesma cerca de tenant
  const exp = await page.request.get(`/pacientes/${a.patientId}/export`);
  expect(exp.status()).toBe(404);

  // Listagem do B não contém o paciente do A
  await page.goto("/pacientes");
  await expect(page.getByText("Paciente E2E negA")).toHaveCount(0);
  void request;
});

test("links públicos com token inválido não vazam nada", async ({ page }) => {
  const r = await page.goto("/documento/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");
  expect(r?.status()).toBe(404);
  await expect(page.getByText("Paciente E2E")).toHaveCount(0);

  await page.goto(`/portal/${a.slug}/sessoes/qualquer-id`);
  await expect(page.getByLabel("Seu WhatsApp"), "sem cookie do portal volta ao pedido de acesso").toBeVisible();
});
