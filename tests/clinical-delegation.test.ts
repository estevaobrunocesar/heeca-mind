import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canDeleteClinicalEntry,
  delegationCanWrite,
  isDelegationActive,
  pickWriteScope,
  validateDelegationWindow,
  type ClinicalScope,
} from "../src/lib/clinical-delegation";

const day = 86_400_000;
const now = new Date("2026-09-19T12:00:00Z");
const at = (days: number) => new Date(now.getTime() + days * day);

describe("isDelegationActive", () => {
  it("vale só dentro do período e enquanto não revogada", () => {
    assert.equal(isDelegationActive({ startsAt: at(-1), expiresAt: at(5), revokedAt: null }, now), true);
    assert.equal(isDelegationActive({ startsAt: at(1), expiresAt: at(5), revokedAt: null }, now), false); // ainda não começou
    assert.equal(isDelegationActive({ startsAt: at(-5), expiresAt: at(-1), revokedAt: null }, now), false); // venceu
    assert.equal(isDelegationActive({ startsAt: at(-1), expiresAt: at(5), revokedAt: at(-0.5) }, now), false); // revogada
  });
  it("o fim é exclusivo: no instante exato de expirar já não vale", () => {
    assert.equal(isDelegationActive({ startsAt: at(-1), expiresAt: now, revokedAt: null }, now), false);
  });
});

describe("validateDelegationWindow", () => {
  it("aceita de hoje até 90 dias", () => {
    assert.equal(validateDelegationWindow(now, at(90), now), null);
    assert.equal(validateDelegationWindow(now, at(1), now), null);
  });
  it("recusa retroativo, invertido e acima de 90 dias", () => {
    assert.match(validateDelegationWindow(at(-3), at(5), now)!, /passado/);
    assert.match(validateDelegationWindow(at(5), at(5), now)!, /depois do início/);
    assert.match(validateDelegationWindow(now, at(91), now)!, /90 dias/);
  });
  it("tolera 'hoje' em qualquer fuso (até 24h atrás)", () => {
    assert.equal(validateDelegationWindow(at(-0.9), at(5), now), null);
  });
});

describe("tipo define escrita", () => {
  it("supervisão nunca escreve; substituição escreve", () => {
    assert.equal(delegationCanWrite("SUPERVISION"), false);
    assert.equal(delegationCanWrite("SUBSTITUTION"), true);
  });
});

const own: ClinicalScope = { professionalId: "ana", canWrite: true, delegationId: null };
const sup: ClinicalScope = { professionalId: "ana", canWrite: false, delegationId: "d1" };
const sub: ClinicalScope = { professionalId: "ana", canWrite: true, delegationId: "d2" };

describe("pickWriteScope", () => {
  it("próprio prontuário antes de qualquer delegação", () => {
    assert.equal(pickWriteScope([sub, own]), own);
  });
  it("substituição serve; supervisão não", () => {
    assert.equal(pickWriteScope([sub]), sub);
    assert.equal(pickWriteScope([sup]), null);
    assert.equal(pickWriteScope([]), null);
  });
});

describe("canDeleteClinicalEntry", () => {
  const byAna = { professionalId: "ana", authorUserId: "u-ana" };
  const byCarlos = { professionalId: "ana", authorUserId: "u-carlos" };
  it("titular exclui qualquer nota do seu prontuário", () => {
    assert.equal(canDeleteClinicalEntry([own], byCarlos, "u-ana"), true);
  });
  it("substituto exclui só o que ele escreveu", () => {
    assert.equal(canDeleteClinicalEntry([sub], byCarlos, "u-carlos"), true);
    assert.equal(canDeleteClinicalEntry([sub], byAna, "u-carlos"), false);
  });
  it("supervisor não exclui nada; sem escopo, nada", () => {
    assert.equal(canDeleteClinicalEntry([sup], byCarlos, "u-carlos"), false);
    assert.equal(canDeleteClinicalEntry([], byAna, "u-ana"), false);
  });
});
