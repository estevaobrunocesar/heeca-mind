import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerPaymentSchema } from "../src/lib/validation/payment";

describe("registerPaymentSchema", () => {
  it("valor vazio vira null (usa o restante da sessão); data vazia vira null", () => {
    const r = registerPaymentSchema.safeParse({ method: "PIX", amount: "", paidAt: "", note: "" });
    assert.ok(r.success);
    assert.equal(r.data.amount, null);
    assert.equal(r.data.paidAt, null);
    assert.equal(r.data.note, null);
  });
  it("aceita valor em formato brasileiro", () => {
    const r = registerPaymentSchema.safeParse({ method: "CARD", amount: "1.250,50", paidAt: "2026-09-19", note: "2x" });
    assert.ok(r.success);
    assert.equal(r.data.amount, 125050);
  });
  it("rejeita forma inválida, valor inválido e data inválida", () => {
    assert.equal(registerPaymentSchema.safeParse({ method: "BITCOIN", amount: "", paidAt: "", note: "" }).success, false);
    assert.equal(registerPaymentSchema.safeParse({ method: "PIX", amount: "abc", paidAt: "", note: "" }).success, false);
    assert.equal(registerPaymentSchema.safeParse({ method: "PIX", amount: "", paidAt: "19/09/2026", note: "" }).success, false);
  });
});
