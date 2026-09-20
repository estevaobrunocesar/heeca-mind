import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { civilDate, computeAmount, openTotal, packagePaymentAmount, pickRule, validateRule, type RuleLike } from "../src/lib/commissions/rules";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rule = (o: Partial<RuleLike>): RuleLike => ({ id: "r", serviceId: null, percentBp: 3000, fixedCents: null, validFrom: d("2026-01-01"), validTo: null, ...o });

describe("pickRule", () => {
  const general = rule({ id: "g", percentBp: 3000 });
  const specific = rule({ id: "s", serviceId: "svc1", percentBp: 4000 });
  const newerGeneral = rule({ id: "g2", percentBp: 3500, validFrom: d("2026-06-01") });
  const expired = rule({ id: "x", percentBp: 9000, validFrom: d("2025-01-01"), validTo: d("2025-12-31") });
  it("específica do serviço prevalece; senão a geral mais recente; vencida nunca", () => {
    assert.equal(pickRule([general, specific, newerGeneral, expired], "svc1", d("2026-09-20"))?.id, "s");
    assert.equal(pickRule([general, specific, newerGeneral, expired], "svc2", d("2026-09-20"))?.id, "g2");
    assert.equal(pickRule([general, newerGeneral], null, d("2026-03-01"))?.id, "g");
    assert.equal(pickRule([expired], "svc1", d("2026-09-20")), null);
  });
  it("validTo inclusivo no último dia", () => {
    assert.equal(pickRule([expired], null, d("2025-12-31"))?.id, "x");
    assert.equal(pickRule([expired], null, d("2026-01-01")), null);
  });
});

describe("valores", () => {
  it("percentual arredonda para baixo em centavos; fixo é o valor", () => {
    assert.equal(computeAmount({ percentBp: 3000, fixedCents: null }, 25_000), 7_500);
    assert.equal(computeAmount({ percentBp: 3333, fixedCents: null }, 10_000), 3_333);
    assert.equal(computeAmount({ percentBp: 1, fixedCents: null }, 99), 0);
    assert.equal(computeAmount({ percentBp: null, fixedCents: 5_000 }, 25_000), 5_000);
  });
  it("pacote: percentual sobre o recebido; fixo proporcional às sessões pagas", () => {
    const pkg = { priceCents: 100_000, sessionsTotal: 5 };
    assert.equal(packagePaymentAmount({ percentBp: 3000, fixedCents: null }, 100_000, pkg), 30_000);
    assert.equal(packagePaymentAmount({ percentBp: null, fixedCents: 5_000 }, 100_000, pkg), 25_000);
    assert.equal(packagePaymentAmount({ percentBp: null, fixedCents: 5_000 }, 50_000, pkg), 12_500, "metade paga → 2,5 sessões");
    assert.equal(packagePaymentAmount({ percentBp: null, fixedCents: 5_000 }, 10_000, { priceCents: 0, sessionsTotal: 5 }), 0);
  });
});

describe("fechamento e validação", () => {
  it("openTotal soma só o não fechado até a data (negativos inclusos)", () => {
    const e = [
      { amountCents: 100, closingId: null, occurredAt: d("2026-09-01") },
      { amountCents: -40, closingId: null, occurredAt: d("2026-09-10") },
      { amountCents: 500, closingId: "c1", occurredAt: d("2026-08-10") },
      { amountCents: 70, closingId: null, occurredAt: d("2026-10-05") },
    ];
    assert.deepEqual(openTotal(e, d("2026-09-30")), { total: 60, count: 2 });
  });
  it("regra exige exatamente um modo e faixas válidas", () => {
    assert.equal(validateRule({ percentBp: 3000, fixedCents: null, validFrom: d("2026-01-01"), validTo: null }), null);
    assert.match(validateRule({ percentBp: null, fixedCents: null, validFrom: d("2026-01-01"), validTo: null }) ?? "", /só um/);
    assert.match(validateRule({ percentBp: 3000, fixedCents: 100, validFrom: d("2026-01-01"), validTo: null }) ?? "", /só um/);
    assert.match(validateRule({ percentBp: 20_000, fixedCents: null, validFrom: d("2026-01-01"), validTo: null }) ?? "", /0 e 100/);
    assert.match(validateRule({ percentBp: 3000, fixedCents: null, validFrom: d("2026-02-01"), validTo: d("2026-01-01") }) ?? "", /depois/);
  });
  it("civilDate usa o dia local do fuso", () => {
    assert.equal(civilDate(new Date("2026-09-21T02:30:00Z"), "America/Sao_Paulo").toISOString(), "2026-09-20T00:00:00.000Z");
  });
});
