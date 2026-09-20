import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { balance, canLink, consumeReasonFor, covers, describeBalance, effectiveStatus, expiresAtFor, type PurchaseLike } from "../src/lib/packages/rules";

const now = new Date("2026-09-20T15:00:00Z");
const base: PurchaseLike = { sessionsTotal: 5, expiresAt: new Date("2026-12-31T23:59:59Z"), status: "ACTIVE", professionalId: "p1", serviceIds: [] };
const used = (n: number, reverted = 0) => [
  ...Array.from({ length: n }, () => ({ revertedAt: null })),
  ...Array.from({ length: reverted }, () => ({ revertedAt: new Date() })),
];

describe("saldo derivado", () => {
  it("total − consumos válidos; revertidos não contam; nunca negativo", () => {
    assert.equal(balance(base, used(2)), 3);
    assert.equal(balance(base, used(2, 3)), 3);
    assert.equal(balance(base, used(7)), 0);
  });
  it("descreve como o briefing pede", () => {
    assert.equal(describeBalance(base, used(2)), "5 contratadas · 2 usadas · 3 disponíveis");
    assert.equal(describeBalance({ sessionsTotal: 1 }, []), "1 contratada · 0 usadas · 1 disponível");
  });
});

describe("status efetivo", () => {
  it("ativo → esgotado quando saldo zera; vencido quando passa a validade; cancelado prevalece", () => {
    assert.equal(effectiveStatus(base, used(1), now), "ACTIVE");
    assert.equal(effectiveStatus(base, used(5), now), "EXHAUSTED");
    assert.equal(effectiveStatus({ ...base, expiresAt: new Date("2026-09-01T00:00:00Z") }, used(1), now), "EXPIRED");
    assert.equal(effectiveStatus({ ...base, status: "CANCELLED" }, [], now), "CANCELLED");
    // esgotado vence sobre vencido: as sessões foram usadas, não perdidas
    assert.equal(effectiveStatus({ ...base, expiresAt: new Date("2026-09-01T00:00:00Z") }, used(5), now), "EXHAUSTED");
  });
});

describe("cobertura e vínculo", () => {
  it("mesmo profissional; serviços vazios = qualquer; lista restringe", () => {
    assert.equal(covers(base, { professionalId: "p1", serviceId: "s1" }), true);
    assert.equal(covers(base, { professionalId: "p2", serviceId: "s1" }), false);
    assert.equal(covers({ ...base, serviceIds: ["s2"] }, { professionalId: "p1", serviceId: "s1" }), false);
    assert.equal(covers({ ...base, serviceIds: ["s1", "s2"] }, { professionalId: "p1", serviceId: "s1" }), true);
  });
  it("só vincula quando ativo e coberto", () => {
    assert.equal(canLink(base, used(4), { professionalId: "p1", serviceId: "s1" }, now), true);
    assert.equal(canLink(base, used(5), { professionalId: "p1", serviceId: "s1" }, now), false);
    assert.equal(canLink({ ...base, expiresAt: new Date("2026-01-01T00:00:00Z") }, [], { professionalId: "p1", serviceId: "s1" }, now), false);
  });
});

describe("D2 — quando consome", () => {
  it("concluída sempre; falta conforme política; o resto nunca", () => {
    assert.equal(consumeReasonFor("COMPLETED", { noShowConsumesPackage: false }), "completed");
    assert.equal(consumeReasonFor("NO_SHOW", { noShowConsumesPackage: true }), "no_show");
    assert.equal(consumeReasonFor("NO_SHOW", { noShowConsumesPackage: false }), null);
    assert.equal(consumeReasonFor("CANCELLED_BY_PATIENT", { noShowConsumesPackage: true }), null);
    assert.equal(consumeReasonFor("CONFIRMED", { noShowConsumesPackage: true }), null);
  });
});

describe("validade em data civil", () => {
  it("90 dias a partir do dia da compra, terminando às 23:59:59 no fuso de São Paulo", () => {
    // 20/09 12:00 BRT + 90 dias = 19/12/2026 23:59:59 BRT = 20/12 02:59:59 UTC
    const e = expiresAtFor(new Date("2026-09-20T15:00:00Z"), 90, "America/Sao_Paulo");
    assert.equal(e.toISOString(), "2026-12-20T02:59:59.000Z");
  });
  it("compra às 23h local ainda conta o dia local, não o dia UTC", () => {
    // 20/09 23:30 BRT = 21/09 02:30 UTC; dia civil da compra = 20/09
    const e = expiresAtFor(new Date("2026-09-21T02:30:00Z"), 1, "America/Sao_Paulo");
    assert.equal(e.toISOString(), "2026-09-22T02:59:59.000Z"); // 21/09 23:59:59 BRT
  });
});
