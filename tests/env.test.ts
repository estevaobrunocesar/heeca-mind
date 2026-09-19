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
} as NodeJS.ProcessEnv;

describe("validateEnv", () => {
  it("aceita configuração mínima de produção e avisa sobre WhatsApp/storage", () => {
    const e = validateEnv(good);
    const w = envWarnings(e);
    assert.ok(w.some((x) => x.includes("WhatsApp")));
    assert.ok(w.some((x) => x.includes("STORAGE_DRIVER=local")));
  });
  it("em produção exige https, CRON_SECRET e chave de 32 bytes", () => {
    assert.throws(() => validateEnv({ ...good, NEXT_PUBLIC_APP_URL: "http://app" }), /https/);
    assert.throws(() => validateEnv({ ...good, CRON_SECRET: undefined }), /CRON_SECRET/);
    assert.throws(() => validateEnv({ ...good, ENCRYPTION_KEY: "abc" }), /32 bytes/);
  });
  it("s3 exige credenciais; WhatsApp exige as quatro variáveis juntas", () => {
    assert.throws(() => validateEnv({ ...good, STORAGE_DRIVER: "s3" }), /S3_BUCKET/);
    assert.throws(() => validateEnv({ ...good, WHATSAPP_PHONE_NUMBER_ID: "1" }), /andam juntos/);
    assert.throws(() => validateEnv({ ...good, WHATSAPP_PHONE_NUMBER_ID: "1", WHATSAPP_ACCESS_TOKEN: "t" }), /WHATSAPP_APP_SECRET/);
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
