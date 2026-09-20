import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAppointmentSchema } from "../src/lib/validation/appointment";
import { blockSchema, profileSchema } from "../src/lib/validation/professional";
import { serviceSchema } from "../src/lib/validation/service";

describe("checkbox ausente (desmarcado)", () => {
  it("serviceSchema aceita isActive ausente como false", () => {
    const r = serviceSchema.safeParse({ name: "Sessão", description: "", durationMinutes: "50", price: "200", modality: "ONLINE", patientInstructions: "" });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.isActive, false);
    assert.equal(r.data.price, 20000);
  });

  it("createAppointmentSchema aceita force ausente e gera recorrência", () => {
    const r = createAppointmentSchema.safeParse({
      patientId: "", newPatientName: "Pedro Alves", newPatientWhatsapp: "11 97777-1234",
      serviceId: "x", modality: "IN_PERSON", date: "2026-09-22", time: "10:00",
      adminNote: "", recurrence: "WEEKLY", recurrenceUntil: "2026-10-13",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.force, false);
    assert.equal(r.data.newPatientWhatsapp, "+5511977771234");
  });

  it("profileSchema: showRegistration/showPrices ausentes viram false", () => {
    const r = profileSchema.safeParse({
      displayName: "Dra. Ana", fullName: "Ana Lúcia", registrationNumber: "06/123456", photoUrl: "", bio: "", approaches: "", specialties: "",
      phone: "", whatsapp: "", email: "", instagram: "", website: "", addressLine: "", addressCity: "", addressState: "", addressZip: "",
      slug: "dra-ana", onlinePlatform: "", onlineFixedLink: "",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.showRegistration, false);
    assert.equal(r.data.showPrices, false);
  });

  it("blockSchema: horários vazios viram dia inteiro", () => {
    const r = blockSchema.safeParse({ type: "DAY_OFF", startDate: "2026-09-30", startTime: "", endDate: "2026-09-30", endTime: "", reason: "" });
    assert.ok(r.success);
    assert.equal(r.data.startTime, "00:00");
    assert.equal(r.data.endTime, "23:59");
  });
});

describe("paciente novo exige nome e WhatsApp", () => {
  it("rejeita sem nome", () => {
    const r = createAppointmentSchema.safeParse({
      patientId: "", newPatientName: "", newPatientWhatsapp: "", serviceId: "x", modality: "ONLINE",
      date: "2026-09-22", time: "10:00", adminNote: "", recurrence: "NONE", recurrenceUntil: "",
    });
    assert.equal(r.success, false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("newPatientName"));
    assert.ok(paths.includes("newPatientWhatsapp"));
  });
});

describe("paciente já cadastrado (modo 'Já cadastrado' não envia campos de paciente novo)", () => {
  it("aceita newPatientName/newPatientWhatsapp ausentes quando patientId vem preenchido", () => {
    const r = createAppointmentSchema.safeParse({
      patientId: "pat_1", serviceId: "x", modality: "ONLINE", date: "2026-09-22", time: "10:00",
      adminNote: "", recurrence: "WEEKLY", recurrenceUntil: "2026-10-13",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.newPatientName, "");
    assert.equal(r.data.newPatientWhatsapp, null);
  });
});
