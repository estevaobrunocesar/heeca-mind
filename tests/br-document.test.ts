import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDocument, normalizeDocument } from "../src/lib/br-document";

describe("CPF/CNPJ", () => {
  it("aceita válidos com ou sem máscara e guarda só dígitos", () => {
    assert.deepEqual(normalizeDocument("529.982.247-25"), { ok: true, value: "52998224725" });
    assert.deepEqual(normalizeDocument("11.222.333/0001-81"), { ok: true, value: "11222333000181" });
    assert.deepEqual(normalizeDocument(""), { ok: true, value: null });
  });
  it("rejeita dígito verificador errado, sequência repetida e tamanho estranho", () => {
    assert.equal(normalizeDocument("529.982.247-26").ok, false);
    assert.equal(normalizeDocument("111.111.111-11").ok, false);
    assert.equal(normalizeDocument("11.222.333/0001-82").ok, false);
    assert.equal(normalizeDocument("12345").ok, false);
  });
  it("formata para exibição", () => {
    assert.equal(formatDocument("52998224725"), "529.982.247-25");
    assert.equal(formatDocument("11222333000181"), "11.222.333/0001-81");
    assert.equal(formatDocument(null), "");
  });
});
