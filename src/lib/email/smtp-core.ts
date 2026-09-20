import { randomBytes } from "node:crypto";

/**
 * Partes puras do cliente SMTP (sem rede): URL, montagem MIME, parsing de
 * resposta. Testadas em tests/smtp-core.test.ts. A parte com socket está em
 * smtp.ts.
 *
 * Por que um cliente próprio e não nodemailer: o next-auth declara nodemailer
 * como peer opcional em versões antigas (^7 || ^8), que carregam avisos de
 * segurança; as novas conflitam na instalação. Nosso uso é mínimo (um
 * destinatário, texto/HTML, sem anexos) — cabe em 150 linhas auditáveis.
 */

export type SmtpConfig = {
  host: string;
  port: number;
  /** smtps:// = TLS desde o início (465). smtp:// = texto + STARTTLS (587). */
  secure: boolean;
  /** smtp://…?starttls=0 aceita conexão sem TLS (só para Mailpit/MailHog local). */
  requireTls: boolean;
  user: string | null;
  pass: string | null;
};

export function parseSmtpUrl(raw: string): SmtpConfig {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("SMTP_URL inválida (esperado smtp://usuario:senha@host:porta ou smtps://…)");
  }
  if (u.protocol !== "smtp:" && u.protocol !== "smtps:") throw new Error("SMTP_URL deve começar com smtp:// ou smtps://");
  const secure = u.protocol === "smtps:";
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : secure ? 465 : 587,
    secure,
    requireTls: secure || u.searchParams.get("starttls") !== "0",
    user: u.username ? decodeURIComponent(u.username) : null,
    pass: u.password ? decodeURIComponent(u.password) : null,
  };
}

/** RFC 2047: cabeçalhos com acentos vão em base64 UTF-8. */
export function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64 quebrado em linhas de 76 colunas (RFC 2045). Evita dot-stuffing e linhas longas. */
export function base64Lines(s: string): string {
  return Buffer.from(s, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
}

/** Extrai só o endereço de "Nome <a@b>" para os comandos MAIL FROM / RCPT TO. */
export function addressOf(header: string): string {
  const m = header.match(/<([^>]+)>/);
  const addr = (m ? m[1] : header).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(addr)) throw new Error(`Endereço de e-mail inválido: ${header}`);
  return addr;
}

export type MimeInput = { from: string; to: string; subject: string; text: string; html?: string; date?: Date; messageId?: string };

/** Mensagem MIME completa (cabeçalhos + corpo), CRLF, pronta para o DATA. */
export function buildMime(m: MimeInput): string {
  const date = (m.date ?? new Date()).toUTCString().replace("GMT", "+0000");
  const domain = addressOf(m.from).split("@")[1];
  const id = m.messageId ?? `${randomBytes(12).toString("hex")}@${domain}`;
  const head = [`From: ${m.from}`, `To: ${m.to}`, `Subject: ${encodeHeader(m.subject)}`, `Date: ${date}`, `Message-ID: <${id}>`, "MIME-Version: 1.0"];

  if (!m.html) {
    return [...head, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", base64Lines(m.text)].join("\r\n") + "\r\n";
  }
  const boundary = `=_hp_${randomBytes(8).toString("hex")}`;
  const part = (type: string, body: string) => [`--${boundary}`, `Content-Type: ${type}; charset=utf-8`, "Content-Transfer-Encoding: base64", "", base64Lines(body)].join("\r\n");
  return [...head, `Content-Type: multipart/alternative; boundary="${boundary}"`, "", part("text/plain", m.text), part("text/html", m.html), `--${boundary}--`].join("\r\n") + "\r\n";
}

export type SmtpReply = { code: number; lines: string[] };

/**
 * Lê uma resposta completa do buffer: linhas "250-xxx" continuam, "250 xxx"
 * encerra. Devolve null se ainda incompleta.
 */
export function parseReply(buffer: string): { reply: SmtpReply; rest: string } | null {
  const lines: string[] = [];
  let pos = 0;
  for (;;) {
    const nl = buffer.indexOf("\r\n", pos);
    if (nl < 0) return null;
    const line = buffer.slice(pos, nl);
    pos = nl + 2;
    if (!/^\d{3}[ -]/.test(line) && !/^\d{3}$/.test(line)) throw new Error(`Resposta SMTP inválida: ${line.slice(0, 80)}`);
    lines.push(line.slice(4));
    if (line[3] !== "-") return { reply: { code: Number(line.slice(0, 3)), lines }, rest: buffer.slice(pos) };
  }
}

/** 4xx = temporário (tenta de novo); 5xx = definitivo. */
export function isRetryableCode(code: number): boolean {
  return code >= 400 && code < 500;
}

export function authPlain(user: string, pass: string): string {
  return Buffer.from(`\0${user}\0${pass}`, "utf8").toString("base64");
}
