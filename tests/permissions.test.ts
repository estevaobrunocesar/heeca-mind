import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessClinicalData, canManageSchedule, canViewFinancials, type Actor } from "../src/lib/permissions";

const mk = (over: Partial<Actor>): Actor => ({ userId: "u", organizationId: "o", role: "PROFESSIONAL", professionalId: "p1", activeProfessionalId: "p1", ...over });

describe("canAccessClinicalData — só o profissional responsável", () => {
  it("psicólogo vê os próprios pacientes e não os de colegas", () => {
    assert.equal(canAccessClinicalData(mk({}), "p1"), true);
    assert.equal(canAccessClinicalData(mk({}), "p2"), false);
  });
  it("dono da clínica: só se for ele mesmo o profissional; sem perfil, nunca", () => {
    assert.equal(canAccessClinicalData(mk({ role: "OWNER", professionalId: "p1" }), "p1"), true);
    assert.equal(canAccessClinicalData(mk({ role: "OWNER", professionalId: "p1" }), "p2"), false);
    assert.equal(canAccessClinicalData(mk({ role: "OWNER", professionalId: null, activeProfessionalId: "p2" }), "p2"), false);
  });
  it("recepção nunca, mesmo que (por erro) tenha perfil", () => {
    assert.equal(canAccessClinicalData(mk({ role: "RECEPTIONIST", professionalId: "p1" }), "p1"), false);
  });
  it("o profissional 'ativo' (seletor) não dá acesso clínico — só o próprio", () => {
    assert.equal(canAccessClinicalData(mk({ role: "OWNER", professionalId: "p1", activeProfessionalId: "p2" }), "p2"), false);
  });
});

describe("contraste com o administrativo", () => {
  it("recepção gerencia agenda de qualquer um, mas não vê valores", () => {
    const r = mk({ role: "RECEPTIONIST", professionalId: null });
    assert.equal(canManageSchedule(r, "p2"), true);
    assert.equal(canViewFinancials(r, "p2"), false);
  });
});
