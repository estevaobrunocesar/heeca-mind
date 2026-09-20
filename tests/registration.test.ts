import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REGISTRATION_BY_SEGMENT, formatRegistration, registrationSpec, REGISTRATION_SPECS } from "../src/lib/registration";
import { registrationField } from "../src/lib/validation/registration";

describe("registro profissional — CRP (regra herdada do Psico)", () => {
  const crp = REGISTRATION_SPECS.CRP;
  it("normaliza com ou sem barra para 'RR/NÚMERO'", () => {
    assert.equal(crp.normalize("06/123456"), "06/123456");
    assert.equal(crp.normalize("06123456"), "06/123456");
    assert.equal(crp.normalize(" 06 1234 "), "06/1234");
  });
  it("rejeita fora de 6 a 8 dígitos", () => {
    assert.equal(crp.normalize("0612"), null);
    assert.equal(crp.normalize("061234567"), null);
    assert.equal(crp.normalize(""), null);
  });
});

describe("registro profissional — outros conselhos", () => {
  it("CRN: região de 1 ou 2 dígitos", () => {
    assert.equal(REGISTRATION_SPECS.CRN.normalize("CRN-3 12345"), "3/12345");
    assert.equal(REGISTRATION_SPECS.CRN.normalize("10/12345"), "10/12345");
    assert.equal(REGISTRATION_SPECS.CRN.normalize("12"), null);
  });
  it("CRFa: região de 1 dígito", () => {
    assert.equal(REGISTRATION_SPECS.CRFa.normalize("CRFa 2-12345"), "2/12345");
    assert.equal(REGISTRATION_SPECS.CRFa.normalize("2"), null);
  });
  it("NONE: texto livre curto, vazio é inválido", () => {
    assert.equal(REGISTRATION_SPECS.NONE.normalize("  Reg. 42 "), "Reg. 42");
    assert.equal(REGISTRATION_SPECS.NONE.normalize("   "), null);
  });
  it("tipo desconhecido cai em CRP (produto nasce orientado a Psicologia)", () => {
    assert.equal(registrationSpec("XYZ").kind, "CRP");
    assert.equal(registrationSpec(null).kind, "CRP");
    assert.equal(DEFAULT_REGISTRATION_BY_SEGMENT.PSYCHOLOGY, "CRP");
  });
});

describe("formatRegistration", () => {
  const pro = { registrationKind: "CRP", registrationNumber: "06/123456", showRegistration: true };
  it("exibe 'CRP 06/123456'", () => assert.equal(formatRegistration(pro), "CRP 06/123456"));
  it("sem número → null (perfil provisionado pelo portal ainda não preenchido)", () =>
    assert.equal(formatRegistration({ ...pro, registrationNumber: null }), null));
  it("showRegistration=false esconde em contexto público, mas force exibe (documento oficial)", () => {
    const hidden = { ...pro, showRegistration: false };
    assert.equal(formatRegistration(hidden), null);
    assert.equal(formatRegistration(hidden, { force: true }), "CRP 06/123456");
  });
  it("NONE não prefixa rótulo", () =>
    assert.equal(formatRegistration({ registrationKind: "NONE", registrationNumber: "Reg. 42" }), "Reg. 42"));
});

describe("registrationField (zod)", () => {
  it("devolve a forma canônica e a mensagem do conselho", () => {
    const f = registrationField("CRP");
    assert.equal(f.safeParse("06123456").data, "06/123456");
    const bad = f.safeParse("12");
    assert.equal(bad.success, false);
    assert.equal(bad.error?.issues[0]?.message, "CRP inválido");
  });
});
