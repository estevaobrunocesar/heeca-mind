import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { envWarnings, validateEnv } from "../src/lib/env";

const KEY = Buffer.alloc(32, 7).toString("base64");
const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@h:5432/db",
  AUTH_SECRET: "x".repeat(40),
  ENCRYPTION_KEY: KEY,
  NEXT_PUBLIC_APP_URL: "https://app.heeca.com.br",
  CRON_SECRET: "y".repeat(24),
  HEECA_PLATFORM_SECRET: "p".repeat(32),
} as NodeJS.ProcessEnv;

describe("validateEnv", () => {
  it("aceita configuração mínima de produção e avisa sobre WhatsApp/storage", () => {
    const e = validateEnv(good);
    const w = envWarnings(e);
    assert.ok(w.some((x) => x.includes("WHATSAPP_PROVIDER=console")));
    assert.ok(w.some((x) => x.includes("STORAGE_DRIVER=local")));
  });
  it("em produção exige HEECA_PLATFORM_SECRET; em dev só avisa", () => {
    assert.throws(() => validateEnv({ ...good, HEECA_PLATFORM_SECRET: undefined }), /HEECA_PLATFORM_SECRET/);
    assert.throws(() => validateEnv({ ...good, HEECA_PLATFORM_SECRET: "curto" }), /16 caracteres/);
    const dev = validateEnv({ ...good, NODE_ENV: "development", HEECA_PLATFORM_SECRET: undefined });
    assert.ok(envWarnings(dev).some((x) => x.includes("HEECA_PLATFORM_SECRET ausente")));
  });
  it("em produção exige https, CRON_SECRET e chave de 32 bytes", () => {
    assert.throws(() => validateEnv({ ...good, NEXT_PUBLIC_APP_URL: "http://app" }), /https/);
    assert.throws(() => validateEnv({ ...good, CRON_SECRET: undefined }), /CRON_SECRET/);
    assert.throws(() => validateEnv({ ...good, ENCRYPTION_KEY: "abc" }), /32 bytes/);
  });
  it("s3 exige credenciais; WHATSAPP_PROVIDER=notify exige NOTIFY_URL e NOTIFY_SECRET", () => {
    assert.throws(() => validateEnv({ ...good, STORAGE_DRIVER: "s3" }), /S3_BUCKET/);
    assert.throws(() => validateEnv({ ...good, WHATSAPP_PROVIDER: "notify" }), /NOTIFY_URL/);
    assert.throws(() => validateEnv({ ...good, WHATSAPP_PROVIDER: "notify", NOTIFY_URL: "https://notify.heeca.com.br", NOTIFY_SECRET: "curto" }), /NOTIFY_SECRET/);
    const ok = validateEnv({ ...good, WHATSAPP_PROVIDER: "notify", NOTIFY_URL: "https://notify.heeca.com.br", NOTIFY_SECRET: "n".repeat(32) });
    assert.equal(ok.NOTIFY_PRODUCT, "mind");
  });
  it("lista todas as falhas de uma vez", () => {
    try {
      validateEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
      assert.fail("deveria lançar");
    } catch (e) {
      const msg = (e as Error).message;
      assert.ok(msg.includes("DATABASE_URL") && msg.includes("AUTH_SECRET") && msg.includes("ENCRYPTION_KEY"));
    }
  });
});

describe("aspas de --env-file", () => {
  it("tolera valores entre aspas", () => {
    const e = validateEnv({ ...good, STORAGE_DRIVER: '"local"', CRON_SECRET: "'" + "z".repeat(20) + "'" } as NodeJS.ProcessEnv);
    assert.equal(e.STORAGE_DRIVER, "local");
    assert.equal(e.CRON_SECRET, "z".repeat(20));
  });
});
