import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { availableActions, canTransition, STATUS_LABEL, STATUS_TONE, targetStatus } from "../src/lib/appointment-status";

describe("IN_PROGRESS (Em atendimento)", () => {
  it("start só a partir de sessão ativa; complete a partir de IN_PROGRESS", () => {
    assert.equal(canTransition("CONFIRMED", "start"), true);
    assert.equal(targetStatus("start"), "IN_PROGRESS");
    assert.equal(canTransition("IN_PROGRESS", "complete"), true);
    assert.equal(canTransition("COMPLETED", "start"), false);
    assert.equal(canTransition("CANCELLED_BY_PATIENT", "start"), false);
  });
  it("em atendimento não cancela, não falta, não reagenda — só conclui", () => {
    assert.deepEqual(availableActions("IN_PROGRESS"), ["complete"]);
  });
  it("tem rótulo e tom", () => {
    assert.equal(STATUS_LABEL.IN_PROGRESS, "Em atendimento");
    assert.ok(STATUS_TONE.IN_PROGRESS);
  });
});
