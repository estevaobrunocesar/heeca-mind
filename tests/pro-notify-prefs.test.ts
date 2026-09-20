import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultPrefs, isEventEnabled, normalizePrefs, prefsFromForm, PRO_EVENTS } from "../src/lib/pro-notify-prefs";

describe("normalizePrefs", () => {
  it("nada no banco = tudo ligado", () => {
    const p = normalizePrefs(null);
    assert.equal(p.enabled, true);
    assert.ok(PRO_EVENTS.every((e) => p.events[e]));
  });
  it("respeita o que está salvo e ignora chaves desconhecidas ou de tipo errado", () => {
    const p = normalizePrefs({ enabled: false, events: { FORM_SUBMITTED: false, INVENTADO: false, BOOKING_REQUESTED: "sim" } });
    assert.equal(p.enabled, false);
    assert.equal(p.events.FORM_SUBMITTED, false);
    assert.equal(p.events.BOOKING_REQUESTED, true);
    assert.equal("INVENTADO" in p.events, false);
  });
  it("evento novo no código fica ligado para quem já tinha preferências salvas", () => {
    const p = normalizePrefs({ enabled: true, events: { FORM_SUBMITTED: false } });
    assert.equal(p.events.DELEGATION_RECEIVED, true);
  });
});

describe("isEventEnabled", () => {
  it("interruptor geral desliga tudo", () => {
    const p = defaultPrefs();
    p.enabled = false;
    assert.equal(isEventEnabled(p, "FORM_SUBMITTED"), false);
    p.enabled = true;
    p.events.FORM_SUBMITTED = false;
    assert.equal(isEventEnabled(p, "FORM_SUBMITTED"), false);
    assert.equal(isEventEnabled(p, "BOOKING_REQUESTED"), true);
  });
});

describe("prefsFromForm", () => {
  it("checkbox ausente = desligado", () => {
    const on = new Set(["enabled", "event_FORM_SUBMITTED"]);
    const p = prefsFromForm((n) => on.has(n));
    assert.equal(p.enabled, true);
    assert.equal(p.events.FORM_SUBMITTED, true);
    assert.equal(p.events.BOOKING_REQUESTED, false);
  });
});
