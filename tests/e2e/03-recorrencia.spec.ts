import { expect, test } from "@playwright/test";
import { createTenant, db, login, type Tenant } from "./fixtures";

/** Jornada 3 — Série semanal: criar → cancelar uma → cancelar a série (passadas/outras intactas). */
let t: Tenant;
test.beforeAll(async () => {
  t = await createTenant("rec");
});

function nextWeekday(daysAhead: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("série semanal: 4 sessões, cancelar só uma, depois encerrar a série", async ({ page }) => {
  await login(page, t.ownerEmail);
  const first = nextWeekday(3);
  const until = new Date(first);
  until.setDate(until.getDate() + 21);

  await page.goto("/agenda/novo");
  await page.getByLabel("Selecione").selectOption(t.patientId);
  await page.locator('select[name="serviceId"]').selectOption(t.serviceId);
  await page.getByLabel("Modalidade").selectOption("ONLINE");
  await page.getByLabel("Data").fill(iso(first));
  await page.getByLabel("Horário").fill("10:00");
  await page.locator('select[name="recurrence"]').selectOption("WEEKLY");
  await page.getByLabel("Até").fill(iso(until));
  await page.getByRole("button", { name: "Criar sessão" }).click();
  await expect(page).toHaveURL(/\/agenda\?view=day/);

  const series = await db.recurringSeries.findFirstOrThrow({ where: { patientId: t.patientId }, include: { appointments: { orderBy: { startsAt: "asc" } } } });
  expect(series.appointments.length).toBe(4);
  expect(series.isActive).toBe(true);

  // Cancelar só a segunda
  const second = series.appointments[1];
  await page.goto(`/agenda/${second.id}`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByLabel("Abrangência").selectOption("one");
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByText(/Cancelado pelo profissional/)).toBeVisible();
  const afterOne = await db.appointment.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, select: { status: true } });
  // Sessões manuais já nascem CONFIRMED (combinadas direto com o profissional).
  expect(afterOne.map((a) => a.status)).toEqual(["CONFIRMED", "CANCELLED_BY_PROFESSIONAL", "CONFIRMED", "CONFIRMED"]);

  // Cancelar a série a partir da terceira: a primeira fica
  const third = series.appointments[2];
  await page.goto(`/agenda/${third.id}`);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByLabel("Abrangência").selectOption("series");
  await page.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(page.getByText(/Cancelado pelo profissional/)).toBeVisible();
  const afterSeries = await db.appointment.findMany({ where: { seriesId: series.id }, orderBy: { startsAt: "asc" }, select: { status: true } });
  expect(afterSeries.map((a) => a.status)).toEqual(["CONFIRMED", "CANCELLED_BY_PROFESSIONAL", "CANCELLED_BY_PROFESSIONAL", "CANCELLED_BY_PROFESSIONAL"]);
  expect((await db.recurringSeries.findUniqueOrThrow({ where: { id: series.id } })).isActive).toBe(false);
});
