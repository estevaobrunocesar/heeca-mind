import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractWebhookEvents, signMetaBody, verifyMetaSignature } from "../src/lib/whatsapp/signature";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ entry: [] });
  it("aceita assinatura correta", () => {
    assert.equal(verifyMetaSignature(body, signMetaBody(body, secret), secret), true);
  });
  it("rejeita corpo alterado, segredo errado, header ausente e sem prefixo", () => {
    const sig = signMetaBody(body, secret);
    assert.equal(verifyMetaSignature(body + " ", sig, secret), false);
    assert.equal(verifyMetaSignature(body, sig, "outro"), false);
    assert.equal(verifyMetaSignature(body, null, secret), false);
    assert.equal(verifyMetaSignature(body, sig.slice(7), secret), false);
    assert.equal(verifyMetaSignature(body, sig, undefined), false);
  });
});

describe("extractWebhookEvents", () => {
  it("separa status e mensagens com ids de deduplicação", () => {
    const events = extractWebhookEvents({
      entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }, { id: "wamid.1", status: "read" }], messages: [{ id: "wamid.2", from: "55", type: "text" }] } }] }],
    });
    assert.deepEqual(events.map((e) => e.eventId), ["status:wamid.1:delivered", "status:wamid.1:read", "message:wamid.2"]);
  });
  it("tolera payload vazio ou malformado", () => {
    assert.deepEqual(extractWebhookEvents({}), []);
    assert.deepEqual(extractWebhookEvents(null), []);
    assert.deepEqual(extractWebhookEvents({ entry: [{}] }), []);
  });
});
