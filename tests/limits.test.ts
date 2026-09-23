import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAddProfessional, maxProfessionalsFrom, seatsFullMessage } from "../src/lib/heeca/limits";

describe("maxProfessionalsFrom (jsonb livre do entitlement)", () => {
  it("lê o número quando o plano traz o limite", () => {
    assert.equal(maxProfessionalsFrom({ maxProfessionals: 1 }), 1);
    assert.equal(maxProfessionalsFrom({ maxProfessionals: 10 }), 10);
  });

  it("trata ausência, tipo errado, zero e negativo como SEM limite", () => {
    assert.equal(maxProfessionalsFrom({}), null);
    assert.equal(maxProfessionalsFrom(null), null);
    assert.equal(maxProfessionalsFrom(undefined), null);
    assert.equal(maxProfessionalsFrom({ maxProfessionals: "3" }), null, "string não vira limite");
    assert.equal(maxProfessionalsFrom({ maxProfessionals: 0 }), null, "zero trancaria a conta inteira");
    assert.equal(maxProfessionalsFrom({ maxProfessionals: -1 }), null);
  });

  it("ignora outras chaves do plano", () => {
    assert.equal(maxProfessionalsFrom({ maxPatients: 500 }), null);
  });
});

describe("canAddProfessional", () => {
  it("sem limite: sempre cabe", () => {
    assert.equal(canAddProfessional(null, 0), true);
    assert.equal(canAddProfessional(null, 99), true);
  });

  it("undefined também é sem limite (coluna nova com cliente Prisma estale)", () => {
    assert.equal(canAddProfessional(undefined, 7), true);
  });

  it("com limite: cabe enquanto os ativos forem menos que o teto", () => {
    assert.equal(canAddProfessional(1, 0), true);
    assert.equal(canAddProfessional(1, 1), false);
    assert.equal(canAddProfessional(3, 2), true);
    assert.equal(canAddProfessional(3, 3), false);
  });

  it("acima do teto (plano rebaixado depois) continua recusando", () => {
    assert.equal(canAddProfessional(2, 5), false);
  });
});

describe("seatsFullMessage", () => {
  it("diz o que fazer e concorda no singular", () => {
    assert.match(seatsFullMessage(1), /1 profissional\./);
    assert.match(seatsFullMessage(3), /3 profissionais\./);
    assert.match(seatsFullMessage(1), /remova um profissional da equipe/i);
    assert.match(seatsFullMessage(1), /mude de plano/i);
  });
});
