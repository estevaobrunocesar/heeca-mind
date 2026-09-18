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

  it("profileSchema: showCrp/showPrices ausentes viram false", () => {
    const r = profileSchema.safeParse({
      displayName: "Dra. Ana", fullName: "Ana Lúcia", crp: "06/123456", photoUrl: "", bio: "", approaches: "", specialties: "",
      phone: "", whatsapp: "", email: "", instagram: "", website: "", addressLine: "", addressCity: "", addressState: "", addressZip: "",
      slug: "dra-ana", onlinePlatform: "", onlineFixedLink: "",
    });
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.showCrp, false);
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
