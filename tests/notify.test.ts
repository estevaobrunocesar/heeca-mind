import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inboundToWebhookEvent } from "../src/lib/whatsapp/inbound";
import { parseButtonPayload } from "../src/lib/whatsapp/replies";
import { buildButtons, buildVariables, renderReference, TEMPLATES, templateTypeByName } from "../src/lib/whatsapp/templates";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz012345";

describe("templates × catálogo do Notify", () => {
  // Espelho de heeca_notify/src/lib/templates.ts — se lá mudar, este teste avisa aqui.
  const UNIFIED: Record<string, { params: number; buttons: string[] }> = {
    heeca_confirmacao: { params: 6, buttons: ["quick_reply", "quick_reply", "quick_reply"] },
    heeca_confirmado: { params: 6, buttons: [] },
    heeca_lembrete: { params: 5, buttons: ["quick_reply", "quick_reply"] },
    heeca_cancelado: { params: 4, buttons: ["url"] },
    heeca_remarcado: { params: 4, buttons: [] },
  };
  it("unificados batem em número de parâmetros e tipos de botão", () => {
    for (const [type, spec] of Object.entries(TEMPLATES)) {
      if (!spec.unified) continue;
      const u = UNIFIED[spec.name];
      assert.ok(u, `${type}: ${spec.name} não é unificado`);
      assert.equal(spec.variables.length, u.params, `${spec.name}: parâmetros`);
      assert.deepEqual((spec.buttons ?? []).map((b) => b.type), u.buttons, `${spec.name}: botões`);
    }
  });
  it("específicos seguem o prefixo heeca_mind_", () => {
    for (const spec of Object.values(TEMPLATES)) if (!spec.unified) assert.match(spec.name, /^heeca_mind_[a-z0-9_]+$/);
  });
  it("templateTypeByName é o inverso do catálogo", () => {
    assert.equal(templateTypeByName("heeca_confirmacao"), "BOOKING_REQUEST");
    assert.equal(templateTypeByName("nada"), null);
  });
});

describe("buildButtons / buildVariables / renderReference", () => {
  it("quick_reply leva <intenção>:<token>; url leva o sufixo pedido", () => {
    assert.deepEqual(buildButtons("BOOKING_REQUEST", { confirmationToken: TOKEN }), [
      { type: "quick_reply", payload: `confirm:${TOKEN}` },
      { type: "quick_reply", payload: `reschedule:${TOKEN}` },
      { type: "quick_reply", payload: `cancel:${TOKEN}` },
    ]);
    assert.deepEqual(buildButtons("CANCELLATION", { professionalSlug: "dra-ana" }), [{ type: "url", text: "dra-ana" }]);
    assert.deepEqual(buildButtons("FORM_REQUEST", { formToken: "t".repeat(20) }), [{ type: "url", text: "t".repeat(20) }]);
    assert.equal(buildButtons("BOOKING_CONFIRMED", {}), undefined);
  });
  it("falha ao enfileirar se falta o identificador do botão", () => {
    assert.throws(() => buildButtons("BOOKING_REQUEST", {}), /confirmationToken/);
    assert.throws(() => buildButtons("CANCELLATION", { confirmationToken: TOKEN }), /professionalSlug/);
  });
  it("renderReference preenche na ordem das variáveis", () => {
    const vars = buildVariables("BOOKING_CONFIRMED", { establishment: "Dra. Ana", service: "Sessão (online)", professionalName: "Dra. Ana", date: "22/09/2026", time: "15:00", instructions: " " });
    assert.equal(renderReference("BOOKING_CONFIRMED", vars), "Horário confirmado ✅ Dra. Ana: Sessão (online) com Dra. Ana, 22/09/2026 às 15:00.  Até lá!");
    assert.throws(() => buildVariables("BOOKING_CONFIRMED", { establishment: "x" }), /ausente/);
  });
});

describe("parseButtonPayload", () => {
  it("reconhece as três intenções com token", () => {
    assert.deepEqual(parseButtonPayload(`confirm:${TOKEN}`), { intent: "confirm", token: TOKEN });
    assert.deepEqual(parseButtonPayload(` cancel:${TOKEN} `), { intent: "cancel", token: TOKEN });
    assert.equal(parseButtonPayload("sim"), null);
    assert.equal(parseButtonPayload("confirm:curto"), null);
    assert.equal(parseButtonPayload("delete:" + TOKEN), null);
  });
});

describe("inboundToWebhookEvent (Notify → evento bruto)", () => {
  it("status vira status:<id>:<status> com erro no formato antigo", () => {
    const r = inboundToWebhookEvent({ type: "status", providerMessageId: "m1", status: "failed", error: "número inválido", tenantId: "org1", ref: "n1" });
    assert.deepEqual(r, { eventId: "status:m1:failed", payload: { id: "m1", status: "failed", errors: [{ message: "número inválido" }], tenantId: "org1", ref: "n1" } });
  });
  it("button_reply vira interativo com o payload do botão; texto vira text", () => {
    const b = inboundToWebhookEvent({ type: "button_reply", from: "+5511999990000", buttonId: `confirm:${TOKEN}`, providerMessageId: "m2" });
    assert.equal(b?.eventId, `message:m2:confirm:${TOKEN}`);
    assert.equal((b?.payload as { interactive?: { button_reply?: { id?: string } } }).interactive?.button_reply?.id, `confirm:${TOKEN}`);
    const t = inboundToWebhookEvent({ type: "text", from: "+5511999990000", text: "sim", providerMessageId: "m3" });
    assert.equal(t?.eventId, "message:m3");
    assert.equal((t?.payload as { text?: { body?: string } }).text?.body, "sim");
  });
  it("lixo → null", () => {
    assert.equal(inboundToWebhookEvent({} as never), null);
    assert.equal(inboundToWebhookEvent({ type: "x", providerMessageId: "m" } as never), null);
  });
});
