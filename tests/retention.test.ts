import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { anonymizationDueAt, isAnonymizationDue, MIN_RETENTION_YEARS } from "../src/lib/lgpd/retention";

const d = (s: string) => new Date(s);

describe("anonymizationDueAt", () => {
  it("não excluído nunca vence", () => {
    assert.equal(anonymizationDueAt({ deletedAt: null, lastAppointmentAt: d("2020-01-01"), retentionYears: 5 }), null);
  });
  it("conta a partir do último atendimento quando é posterior à exclusão", () => {
    const due = anonymizationDueAt({ deletedAt: d("2021-01-01"), lastAppointmentAt: d("2021-06-15"), retentionYears: 5 });
    assert.equal(due?.toISOString().slice(0, 10), "2026-06-15");
  });
  it("conta a partir da exclusão quando não há atendimento posterior", () => {
    const due = anonymizationDueAt({ deletedAt: d("2021-01-01"), lastAppointmentAt: d("2019-03-03"), retentionYears: 5 });
    assert.equal(due?.toISOString().slice(0, 10), "2026-01-01");
    const noAppt = anonymizationDueAt({ deletedAt: d("2021-01-01"), lastAppointmentAt: null, retentionYears: 5 });
    assert.equal(noAppt?.toISOString().slice(0, 10), "2026-01-01");
  });
  it("nunca abaixo do mínimo legal, mesmo se a organização configurar menos", () => {
    const due = anonymizationDueAt({ deletedAt: d("2021-01-01"), lastAppointmentAt: null, retentionYears: 1 });
    assert.equal(due?.getUTCFullYear(), 2021 + MIN_RETENTION_YEARS);
  });
  it("isAnonymizationDue compara com o agora", () => {
    const input = { deletedAt: d("2021-01-01"), lastAppointmentAt: null, retentionYears: 5 };
    assert.equal(isAnonymizationDue(input, d("2025-12-31")), false);
    assert.equal(isAnonymizationDue(input, d("2026-01-01")), true);
  });
});
