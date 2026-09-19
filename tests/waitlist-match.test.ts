import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describePrefs, matchesSlot, parsePrefs, periodOfHour, sortWaitlist } from "../src/lib/waitlist-match";

describe("periodOfHour", () => {
  it("manhã até 11h59, tarde até 17h59, noite depois", () => {
    assert.equal(periodOfHour(0), "MORNING");
    assert.equal(periodOfHour(11), "MORNING");
    assert.equal(periodOfHour(12), "AFTERNOON");
    assert.equal(periodOfHour(17), "AFTERNOON");
    assert.equal(periodOfHour(18), "EVENING");
    assert.equal(periodOfHour(23), "EVENING");
  });
});

describe("matchesSlot", () => {
  const slot = { modality: "ONLINE" as const, weekday: 2, hour: 15 };
  it("preferência vazia combina com tudo", () => {
    assert.equal(matchesSlot({ modality: null, weekdays: [], periods: [] }, slot), true);
  });
  it("cada dimensão informada restringe", () => {
    assert.equal(matchesSlot({ modality: "IN_PERSON", weekdays: [], periods: [] }, slot), false);
    assert.equal(matchesSlot({ modality: null, weekdays: [1, 3], periods: [] }, slot), false);
    assert.equal(matchesSlot({ modality: null, weekdays: [2], periods: ["MORNING"] }, slot), false);
    assert.equal(matchesSlot({ modality: "ONLINE", weekdays: [2], periods: ["AFTERNOON"] }, slot), true);
  });
});

describe("sortWaitlist", () => {
  const d = (s: string) => new Date(s);
  it("prioritários primeiro, depois ordem de chegada; estável", () => {
    const rows = [
      { id: "b", priority: false, createdAt: d("2026-09-02") },
      { id: "c", priority: true, createdAt: d("2026-09-03") },
      { id: "a", priority: false, createdAt: d("2026-09-01") },
      { id: "d", priority: true, createdAt: d("2026-09-04") },
    ];
    assert.deepEqual(sortWaitlist(rows).map((r) => r.id), ["c", "d", "a", "b"]);
  });
});

describe("parsePrefs / describePrefs", () => {
  it("normaliza checkboxes de formulário (string única ou lista) e ignora lixo", () => {
    const p = parsePrefs({ modality: "ONLINE", weekdays: ["1", "3", "9", "x", "3"], periods: "EVENING" });
    assert.deepEqual(p, { modality: "ONLINE", weekdays: [1, 3], periods: ["EVENING"] });
    assert.deepEqual(parsePrefs({ modality: "HYBRID" }), { modality: null, weekdays: [], periods: [] });
  });
  it("descreve de forma legível", () => {
    assert.equal(describePrefs({ modality: null, weekdays: [], periods: [] }), "qualquer modalidade · qualquer dia · qualquer período");
    assert.equal(describePrefs({ modality: "IN_PERSON", weekdays: [1, 3], periods: ["MORNING", "EVENING"] }), "presencial · Seg/Qua · manhã/noite");
  });
});
