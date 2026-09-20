import { expect, test } from "@playwright/test";
import { createTenant, db, lastButtonToken, type Tenant } from "./fixtures";

/**
 * Jornada 5 — Portal do paciente: link mágico → home → reagendar (dentro do prazo) →
 * cancelar negado (fora do prazo) → atualizar dados → token não reutilizável.
 */
let t: Tenant;
let farId: string; // sessão daqui a 7 dias: pode reagendar/cancelar
let soonId: string; // sessão daqui a 3 h: fora do prazo (24h)

function atHour(daysAhead: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

test.beforeAll(async () => {
  t = await createTenant("portal");
  const base = { organizationId: t.orgId, professionalId: t.proId, patientId: t.patientId, serviceId: t.serviceId, serviceNameSnapshot: "Sessão individual", priceCents: 25000, durationMinutes: 50, modality: "ONLINE" as const, status: "CONFIRMED" as const };
  const far = atHour(7, 14);
  const soon = new Date(Date.now() + 3 * 3_600_000);
  farId = (await db.appointment.create({ data: { ...base, startsAt: far, endsAt: new Date(far.getTime() + 50 * 60_000) } })).id;
  soonId = (await db.appointment.create({ data: { ...base, startsAt: soon, endsAt: new Date(soon.getTime() + 50 * 60_000) } })).id;
});

test("link mágico, reagendamento dentro da política, cancelamento negado fora dela, dados", async ({ page }) => {
  await page.goto(`/portal/${t.slug}`);
  await expect(page.getByRole("heading", { name: "Portal do paciente" })).toBeVisible();
  await page.getByLabel("Seu WhatsApp").fill(t.patientPhone);
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page.getByText(/você receberá um link por WhatsApp/)).toBeVisible();

  const token = await lastButtonToken("PORTAL_LOGIN", t.patientId);
  await page.goto(`/portal/entrar/${token}`);
  await expect(page.getByRole("heading", { name: /Olá, Paciente/ })).toBeVisible();
  await expect(page.getByText("Próximas sessões")).toBeVisible();

  // Sessão distante: reagendar para outro dia
  await page.goto(`/portal/${t.slug}/sessoes/${farId}`);
  await page.getByRole("link", { name: "Escolher outro horário" }).click();
  await expect(page).toHaveURL(/\/reagendar/);
  const otherDay = page.locator('a[href*="reagendar?date="]').nth(1);
  await expect(otherDay).toBeVisible();
  await otherDay.click();
  await page.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await page.getByRole("button", { name: /^Confirmar \d{2}:\d{2}$/ }).click();
  await expect(page).toHaveURL(/rescheduled=1/);
  const moved = await db.appointment.findUniqueOrThrow({ where: { id: farId }, select: { startsAt: true, status: true } });
  expect(moved.startsAt.getTime()).not.toBe(atHour(7, 14).getTime());
  expect(["PENDING", "CONFIRMED", "RESCHEDULE_REQUESTED"]).toContain(moved.status);

  // Sessão em 3 h: política de 24h bloqueia alterar por aqui
  await page.goto(`/portal/${t.slug}/sessoes/${soonId}`);
  await expect(page.getByText(/O prazo para alterar por aqui \(24h antes\) já passou/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar sessão" })).toHaveCount(0);
  expect((await db.appointment.findUniqueOrThrow({ where: { id: soonId } })).status).toBe("CONFIRMED");

  // Meus dados: só administrativo
  await page.goto(`/portal/${t.slug}/dados`);
  await page.getByLabel("Cidade").fill("Campinas");
  await page.getByLabel("UF").fill("SP");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Dados atualizados.")).toBeVisible();
  const p = await db.patient.findUniqueOrThrow({ where: { id: t.patientId }, select: { addressCity: true, addressState: true } });
  expect(p).toEqual({ addressCity: "Campinas", addressState: "SP" });

  // Sair e tentar reusar o mesmo token → volta para o pedido de acesso
  await page.getByRole("button", { name: "Sair" }).click();
  await page.goto(`/portal/entrar/${token}`);
  await expect(page).toHaveURL(/\/portal\?invalid=1/);
  await expect(page.getByText(/não é mais válido/)).toBeVisible();
});
