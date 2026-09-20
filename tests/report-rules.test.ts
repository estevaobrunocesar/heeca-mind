import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avgCents, clientCohorts, groupSum, pct, reactivationCandidates, surveySummary, workingMinutes } from "../src/lib/reports/rules";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const now = d("2026-09-20");

describe("capacidade e razões", () => {
  it("workingMinutes soma a grade por dia da semana no intervalo", () => {
    const rules = [
      { weekday: 1, startTime: "09:00", endTime: "12:00" }, // seg: 180
      { weekday: 1, startTime: "14:00", endTime: "18:00" }, // seg: 240
      { weekday: 3, startTime: "10:00", endTime: "11:00" }, // qua: 60
    ];
    // 2026-09-21 (seg) a 2026-09-27 (dom): 1 seg + 1 qua
    assert.equal(workingMinutes(rules, "2026-09-21", "2026-09-27"), 480);
    assert.equal(workingMinutes(rules, "2026-09-22", "2026-09-22"), 0);
  });
  it("pct e avgCents devolvem null sem denominador", () => {
    assert.equal(pct(1, 4), 25);
    assert.equal(pct(0, 0), null);
    assert.equal(avgCents(25_000, 2), 12_500);
    assert.equal(avgCents(0, 0), null);
  });
});

describe("clientes", () => {
  const p = (o: Partial<Parameters<typeof clientCohorts>[0][number]>) => ({ createdAt: d("2026-01-01"), followUpStatus: "ACTIVE", lastCompletedAt: d("2026-09-10"), completedCount: 5, hasActiveSeries: false, deletedAt: null, ...o });
  it("novos, ativos, recorrentes, inativos e retenção", () => {
    const c = clientCohorts(
      [
        p({ createdAt: d("2026-09-05"), completedCount: 1 }), // novo, ativo, não recorrente
        p({ completedCount: 3 }), // recorrente
        p({ completedCount: 1, hasActiveSeries: true }), // recorrente por série
        p({ lastCompletedAt: d("2026-05-01"), completedCount: 2 }), // inativo (> 90 d)
        p({ followUpStatus: "DISCHARGED", completedCount: 8 }), // alta: fora de ativos, conta na retenção
        p({ completedCount: 0, lastCompletedAt: null, createdAt: d("2026-09-18") }), // novo sem sessão
        p({ deletedAt: d("2026-08-01") }), // excluído: fora de tudo
      ],
      { from: d("2026-09-01"), to: d("2026-10-01") },
      now,
    );
    assert.equal(c.new, 2);
    assert.equal(c.active, 5);
    assert.equal(c.recurring, 2);
    assert.equal(c.inactive, 1);
    // ≥2 concluídas: 4 (3,1s? não), vamos contar: [1]=1, [3]=3✓, [1 série]=1, [2]=2✓, [8]=8✓, [0], → 3 de 5 com ≥1
    assert.equal(c.retentionPct, 60);
  });
});

describe("agrupamento, pesquisa e reativação", () => {
  it("groupSum ordena do maior para o menor", () => {
    const g = groupSum([{ k: "a", v: 10 }, { k: "b", v: 30 }, { k: "a", v: 5 }], (x) => x.k, (x) => x.v);
    assert.deepEqual(g, [{ key: "b", total: 30, count: 1 }, { key: "a", total: 15, count: 2 }]);
  });
  it("surveySummary: média com 1 casa, promotores ≥ 9, detratores ≤ 6", () => {
    assert.deepEqual(surveySummary([10, 9, 7, 6, 3]), { avg: 7, count: 5, promoters: 2, detractors: 2 });
    assert.deepEqual(surveySummary([]), { avg: null, count: 0, promoters: 0, detractors: 0 });
  });
  it("reactivationCandidates: ativos, parados há N dias, sem futuro, não contatados recentemente; mais antigos primeiro", () => {
    const base = { followUpStatus: "ACTIVE", createdAt: d("2026-01-01"), hasFutureAppointment: false, lastContactAt: null as Date | null, deletedAt: null as Date | null };
    const list = reactivationCandidates(
      [
        { ...base, id: "recent", lastCompletedAt: d("2026-09-01") },
        { ...base, id: "old", lastCompletedAt: d("2026-05-01") },
        { ...base, id: "older", lastCompletedAt: d("2026-03-01") },
        { ...base, id: "has-future", lastCompletedAt: d("2026-03-01"), hasFutureAppointment: true },
        { ...base, id: "contacted", lastCompletedAt: d("2026-03-01"), lastContactAt: d("2026-09-01") },
        { ...base, id: "discharged", lastCompletedAt: d("2026-03-01"), followUpStatus: "DISCHARGED" },
        { ...base, id: "never", lastCompletedAt: null, createdAt: d("2026-02-01") },
      ],
      now,
      90,
    ).map((p) => p.id);
    assert.deepEqual(list, ["never", "older", "old"]);
  });
});
