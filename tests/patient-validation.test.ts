import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { patientSchema } from "../src/lib/validation/patient";

const base = {
  name: "Maria Souza", whatsapp: "(11) 98888-0002", email: "", usualModality: "", followUpStatus: "ACTIVE",
  preferredPaymentMethod: "", bestContactTime: "", adminNotes: "",
};

describe("patientSchema", () => {
  it("normaliza telefone e vazios viram null; checkbox ausente = false", () => {
    const r = patientSchema.safeParse(base);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.equal(r.data.whatsapp, "+5511988880002");
    assert.equal(r.data.email, null);
    assert.equal(r.data.usualModality, null);
    assert.equal(r.data.preferredPaymentMethod, null);
    assert.equal(r.data.needsReceipt, false);
  });
  it("exige WhatsApp e nome", () => {
    const r = patientSchema.safeParse({ ...base, whatsapp: "", name: "Jo" });
    assert.equal(r.success, false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    assert.ok(paths.includes("whatsapp"));
    assert.ok(paths.includes("name"));
  });
  it("rejeita e-mail inválido e status desconhecido", () => {
    assert.equal(patientSchema.safeParse({ ...base, email: "x@" }).success, false);
    assert.equal(patientSchema.safeParse({ ...base, followUpStatus: "FOO" }).success, false);
  });
});
