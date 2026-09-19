import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReply, replyTextFrom } from "../src/lib/whatsapp/replies";

describe("parseReply", () => {
  it("reconhece confirmações em variações comuns", () => {
    for (const t of ["Sim", "sim!", "  SIM ", "Confirmar", "confirmo.", "1", "ok", "✅"]) assert.equal(parseReply(t), "yes", t);
  });
  it("reconhece cancelamentos, com e sem acento", () => {
    for (const t of ["Não", "nao", "Cancelar", "cancela", "2", "Não vou", "desmarcar"]) assert.equal(parseReply(t), "no", t);
  });
  it("ignora texto livre", () => {
    for (const t of ["oi, tudo bem?", "posso mudar o horário?", "", "simone"]) assert.equal(parseReply(t), null, t);
  });
});

describe("replyTextFrom", () => {
  it("prefere o payload do botão ao texto", () => {
    assert.equal(replyTextFrom({ button: { text: "Confirmar horário", payload: "confirmar" } }), "confirmar");
    assert.equal(replyTextFrom({ interactive: { button_reply: { id: "cancelar", title: "Não vou poder" } } }), "cancelar");
    assert.equal(replyTextFrom({ text: { body: "sim" } }), "sim");
  });
});
