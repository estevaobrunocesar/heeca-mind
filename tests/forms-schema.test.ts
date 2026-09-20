import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldsSchema, formatAnswer, STARTER_TEMPLATES, validateAnswers, type FormField } from "../src/lib/forms-schema";

const fields: FormField[] = [
  { id: "nome", type: "short_text", label: "Nome", required: true },
  { id: "motivo", type: "long_text", label: "Motivo", required: false },
  { id: "antes", type: "yes_no", label: "Já fez?", required: true },
  { id: "acomp", type: "multi_choice", label: "Acompanhamento", required: false, options: ["Psiquiatria", "Nenhum"] },
  { id: "modal", type: "single_choice", label: "Modalidade", required: true, options: ["Online", "Presencial"] },
  { id: "sono", type: "scale", label: "Sono", required: false },
  { id: "nasc", type: "date", label: "Nascimento", required: false },
  { id: "aviso", type: "info", label: "Só leia", required: false },
];

describe("fieldsSchema", () => {
  it("aceita os modelos iniciais", () => {
    for (const t of STARTER_TEMPLATES) assert.equal(fieldsSchema.safeParse(t.fields).success, true, t.key);
  });
  it("recusa id repetido e escolha sem opções", () => {
    assert.equal(fieldsSchema.safeParse([{ id: "a", type: "short_text", label: "x" }, { id: "a", type: "short_text", label: "y" }]).success, false);
    assert.equal(fieldsSchema.safeParse([{ id: "a", type: "single_choice", label: "x", options: ["só uma"] }]).success, false);
    assert.equal(fieldsSchema.safeParse([]).success, false);
  });
});

describe("validateAnswers", () => {
  it("tipa cada resposta e ignora campos info", () => {
    const { answers, errors } = validateAnswers(fields, { nome: "Bia", antes: "yes", acomp: ["Psiquiatria", "Psiquiatria"], modal: "Online", sono: "7", nasc: "1990-05-02", aviso: "lixo" });
    assert.deepEqual(errors, {});
    assert.deepEqual(answers, { nome: "Bia", antes: true, acomp: ["Psiquiatria"], modal: "Online", sono: 7, nasc: "1990-05-02" });
  });
  it("obrigatórios faltando e valores fora do domínio", () => {
    const { errors } = validateAnswers(fields, { nome: "", antes: "talvez", modal: "Híbrido", sono: "11", nasc: "02/05/1990", acomp: "Outro" });
    assert.equal(errors.nome, "Obrigatório");
    assert.match(errors.antes, /sim ou não/);
    assert.equal(errors.modal, "Opção inválida");
    assert.match(errors.sono, /0 e 10/);
    assert.equal(errors.nasc, "Data inválida");
    assert.equal(errors.acomp, "Opção inválida");
  });
  it("opcional vazio não vira resposta", () => {
    const { answers } = validateAnswers(fields, { nome: "x", antes: "no", modal: "Online", motivo: "   ", sono: "" });
    assert.equal("motivo" in answers, false);
    assert.equal("sono" in answers, false);
    assert.equal(answers.antes, false);
  });
  it("limita tamanho de texto", () => {
    const { errors } = validateAnswers(fields, { nome: "a".repeat(301), antes: "yes", modal: "Online" });
    assert.match(errors.nome, /300/);
  });
});

describe("formatAnswer", () => {
  it("formata por tipo", () => {
    assert.equal(formatAnswer(fields[2], true), "Sim");
    assert.equal(formatAnswer(fields[5], 7), "7/10");
    assert.equal(formatAnswer(fields[6], "1990-05-02"), "02/05/1990");
    assert.equal(formatAnswer(fields[3], ["A", "B"]), "A, B");
    assert.equal(formatAnswer(fields[0], undefined), "—");
  });
});
