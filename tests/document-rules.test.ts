import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acceptanceHash, bodyHash, canAccept, canonicalBody, DEFAULT_DOCUMENT_TEMPLATES, extractVariables, isNewVersion, nameMatches, renderDocument, unknownVariables } from "../src/lib/documents/rules";

describe("variáveis e render", () => {
  it("extrai na ordem, sem repetir; acusa desconhecidas", () => {
    const body = "Eu, {{paciente.nome}}, com {{ profissional.nome }} em {{data}}. {{paciente.nome}} {{foo.bar}}";
    assert.deepEqual(extractVariables(body), ["paciente.nome", "profissional.nome", "data", "foo.bar"]);
    assert.deepEqual(unknownVariables(body), ["foo.bar"]);
  });
  it("preenche e lista as que faltaram", () => {
    const r = renderDocument("{{paciente.nome}} · {{servico}} · {{valor}}", { "paciente.nome": "Maria", valor: "R$ 250,00" });
    assert.equal(r.text, "Maria · — · R$ 250,00");
    assert.deepEqual(r.missing, ["servico"]);
  });
  it("modelos iniciais só usam variáveis conhecidas", () => {
    for (const t of DEFAULT_DOCUMENT_TEMPLATES) assert.deepEqual(unknownVariables(t.body), [], t.title);
  });
});

describe("hashes", () => {
  it("hash do corpo ignora CRLF e espaços à direita, mas não o conteúdo", () => {
    assert.equal(bodyHash("a \r\nb\n"), bodyHash("a\nb"));
    assert.notEqual(bodyHash("a\nb"), bodyHash("a\nc"));
    assert.equal(canonicalBody("  x  \r\n y \n\n"), "x\n y");
  });
  it("hash do aceite muda com nome, instante, IP e texto", () => {
    const base = { bodyHash: bodyHash("texto"), name: "Maria Souza", acceptedAt: new Date("2026-09-20T15:00:00Z"), ip: "1.2.3.4" };
    const h = acceptanceHash(base);
    assert.equal(h, acceptanceHash({ ...base, name: "  maria SOUZA " }), "nome normalizado");
    assert.notEqual(h, acceptanceHash({ ...base, ip: "5.6.7.8" }));
    assert.notEqual(h, acceptanceHash({ ...base, acceptedAt: new Date("2026-09-20T15:00:01Z") }));
    assert.notEqual(h, acceptanceHash({ ...base, bodyHash: bodyHash("outro") }));
  });
});

describe("conferência de nome e estado", () => {
  it("nome completo igual, ou primeiro+último iguais; sem acentos e caixa", () => {
    assert.equal(nameMatches("Maria Souza", "Maria da Silva Souza"), true);
    assert.equal(nameMatches("MARÍA SOUZA", "Maria Souza"), true);
    assert.equal(nameMatches("Maria Silva", "Maria da Silva Souza"), false);
    assert.equal(nameMatches("Maria", "Maria Souza"), false);
    assert.equal(nameMatches("", "Maria Souza"), false);
  });
  it("aceita só pendente/visualizado dentro do prazo", () => {
    const now = new Date("2026-09-20T00:00:00Z");
    const future = new Date("2026-10-01T00:00:00Z");
    assert.equal(canAccept("PENDING", future, now), true);
    assert.equal(canAccept("VIEWED", future, now), true);
    assert.equal(canAccept("ACCEPTED", future, now), false);
    assert.equal(canAccept("PENDING", new Date("2026-09-01T00:00:00Z"), now), false);
  });
  it("nova versão só quando título ou texto mudam de verdade", () => {
    assert.equal(isNewVersion({ title: "T", body: "a\n" }, { title: "T ", body: "a" }), false);
    assert.equal(isNewVersion({ title: "T", body: "a" }, { title: "T", body: "b" }), true);
  });
});
