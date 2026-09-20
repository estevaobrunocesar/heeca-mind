import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addressOf, authPlain, base64Lines, buildMime, encodeHeader, isRetryableCode, parseReply, parseSmtpUrl } from "../src/lib/email/smtp-core";

describe("parseSmtpUrl", () => {
  it("smtps = TLS implícito na 465; smtp = STARTTLS na 587", () => {
    const a = parseSmtpUrl("smtps://apikey:SG.abc@smtp.sendgrid.net");
    assert.deepEqual([a.host, a.port, a.secure, a.requireTls, a.user, a.pass], ["smtp.sendgrid.net", 465, true, true, "apikey", "SG.abc"]);
    const b = parseSmtpUrl("smtp://user%40dominio.com:s%23nha@smtp.gmail.com:587");
    assert.deepEqual([b.port, b.secure, b.requireTls, b.user, b.pass], [587, false, true, "user@dominio.com", "s#nha"]);
  });
  it("Mailpit local sem TLS só com opt-in explícito", () => {
    const c = parseSmtpUrl("smtp://localhost:1025?starttls=0");
    assert.deepEqual([c.port, c.requireTls, c.user], [1025, false, null]);
  });
  it("recusa outros esquemas", () => {
    assert.throws(() => parseSmtpUrl("http://x"), /smtp:\/\//);
    assert.throws(() => parseSmtpUrl("nada"), /inválida/);
  });
});

describe("MIME", () => {
  it("cabeçalho ASCII passa; acentuado vai em RFC 2047", () => {
    assert.equal(encodeHeader("Hello"), "Hello");
    assert.equal(encodeHeader("Sessão amanhã"), `=?UTF-8?B?${Buffer.from("Sessão amanhã").toString("base64")}?=`);
  });
  it("base64 quebra em 76 colunas", () => {
    const lines = base64Lines("x".repeat(200)).split("\r\n");
    assert.ok(lines.every((l) => l.length <= 76));
  });
  it("addressOf extrai de 'Nome <a@b>' e valida", () => {
    assert.equal(addressOf("Hecca Psico <no-reply@hecca.com.br>"), "no-reply@hecca.com.br");
    assert.equal(addressOf("ana@exemplo.com"), "ana@exemplo.com");
    assert.throws(() => addressOf("sem arroba"), /inválido/);
  });
  it("texto simples: cabeçalhos + corpo base64, CRLF, sem linha começando com ponto", () => {
    const m = buildMime({ from: "A <a@x.com>", to: "b@y.com", subject: "Olá", text: ".ponto no início\nlinha", date: new Date("2026-09-20T00:00:00Z"), messageId: "id1@x.com" });
    assert.ok(m.startsWith("From: A <a@x.com>\r\nTo: b@y.com\r\nSubject: =?UTF-8?B?"));
    assert.ok(m.includes("Message-ID: <id1@x.com>"));
    assert.ok(m.includes("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"));
    assert.ok(!m.split("\r\n").some((l) => l.startsWith(".")));
    assert.ok(!m.includes("\n\n")); // só CRLF
  });
  it("html: multipart/alternative com as duas partes", () => {
    const m = buildMime({ from: "a@x.com", to: "b@y.com", subject: "s", text: "t", html: "<b>t</b>" });
    assert.match(m, /Content-Type: multipart\/alternative; boundary="[^"]+"/);
    assert.equal((m.match(/Content-Transfer-Encoding: base64/g) ?? []).length, 2);
    assert.ok(m.trimEnd().endsWith("--"));
  });
});

describe("parseReply", () => {
  it("multi-linha continua com '-' e termina com espaço", () => {
    assert.equal(parseReply("250-smtp.x\r\n250-STARTTLS\r\n"), null);
    const r = parseReply("250-smtp.x\r\n250-STARTTLS\r\n250 AUTH PLAIN LOGIN\r\n354 go\r\n");
    assert.deepEqual(r?.reply, { code: 250, lines: ["smtp.x", "STARTTLS", "AUTH PLAIN LOGIN"] });
    assert.equal(r?.rest, "354 go\r\n");
  });
  it("linha sem código é erro", () => {
    assert.throws(() => parseReply("lixo\r\n"), /inválida/);
  });
  it("4xx tenta de novo, 5xx não", () => {
    assert.equal(isRetryableCode(451), true);
    assert.equal(isRetryableCode(550), false);
  });
  it("AUTH PLAIN = base64(\\0user\\0pass)", () => {
    assert.equal(Buffer.from(authPlain("u", "p"), "base64").toString(), "\0u\0p");
  });
});
