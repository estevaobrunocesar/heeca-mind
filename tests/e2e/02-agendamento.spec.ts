import { expect, test } from "@playwright/test";
import { createTenant, db, login, type Tenant } from "./fixtures";

/**
 * Jornada 2 — Agendamento público → confirmação por token → conclusão → pagamento (F2 + F5).
 */
let t: Tenant;
test.beforeAll(async () => {
  t = await createTenant("book");
});

test("paciente novo agenda pela página pública e o profissional conclui e recebe", async ({ page }) => {
  // Página pública → serviço → modalidade → primeiro dia livre → primeiro horário → formulário
  await page.goto(`/agendar/${t.slug}`);
  await expect(page.getByRole("heading", { name: `Dra. E2E book` })).toBeVisible();
  await page.getByRole("link", { name: /Sessão individual/ }).click();
  await expect(page.getByRole("heading", { name: "Como prefere ser atendido(a)?" })).toBeVisible();
  await page.waitForLoadState("networkidle"); // hidratação: clique em <Link> durante a hidratação pode se perder
  await page.getByRole("link", { name: "Online" }).click();
  await expect(page).toHaveURL(/modality=ONLINE/);
  const day = page.locator('a[href*="date="]').first();
  await expect(day).toBeVisible();
  await day.click();
  const slot = page.locator('a[href*="time="]').first();
  await expect(slot).toBeVisible();
  await slot.click();
  await page.getByRole("textbox", { name: "Nome" }).fill("Novo Paciente E2E");
  await page.getByRole("textbox", { name: "WhatsApp" }).fill("(11) 97777-1234");
  await page.getByRole("textbox", { name: "E-mail" }).fill("novo-e2e@teste.local");
  await page.locator('input[name="consent"]').check();
  await page.getByRole("button", { name: "Solicitar agendamento" }).click();
  await expect(page).toHaveURL(/\/solicitado/);

  const appt = await db.appointment.findFirstOrThrow({ where: { professionalId: t.proId, patient: { whatsapp: "+5511977771234" } }, select: { id: true, status: true, confirmationToken: true, patientId: true } });
  expect(appt.status).toBe("AWAITING_CONFIRMATION");
  expect(appt.confirmationToken).toBeTruthy();
  const n = await db.notification.findFirst({ where: { appointmentId: appt.id, type: "BOOKING_REQUEST" }, select: { templateName: true } });
  expect(n?.templateName).toBe("heeca_confirmacao");

  // Paciente confirma pelo link (o mesmo que iria no WhatsApp)
  await page.goto(`/confirmar/${appt.confirmationToken}`);
  await page.getByRole("button", { name: /Confirmar/ }).click();
  await expect(page.getByText("Seu horário está confirmado.")).toBeVisible();
  expect((await db.appointment.findUniqueOrThrow({ where: { id: appt.id } })).status).toBe("CONFIRMED");

  // Profissional conclui e registra pagamento
  await login(page, t.ownerEmail);
  await page.goto(`/agenda/${appt.id}`);
  await page.getByRole("button", { name: "Marcar como concluída" }).click();
  await expect(page.getByText("Concluído", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Registrar pagamento" }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(page.locator("span.rounded-full", { hasText: /^Pago$/ })).toBeVisible();

  const after = await db.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { payments: true, experienceSurvey: true } });
  expect(after.paymentStatus).toBe("PAID");
  expect(after.payments[0]?.amountCents).toBe(25000);
  expect(after.experienceSurvey, "pesquisa agendada (surveyEnabled)").toBeTruthy();
});
