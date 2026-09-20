import "server-only";
import net from "node:net";
import tls from "node:tls";
import { emailFrom, type EmailMessage, type EmailProvider, type EmailResult } from "./provider";
import { addressOf, authPlain, buildMime, isRetryableCode, parseReply, parseSmtpUrl, type SmtpConfig, type SmtpReply } from "./smtp-core";

/**
 * Cliente SMTP mínimo: EHLO → (STARTTLS) → AUTH PLAIN/LOGIN → MAIL/RCPT/DATA → QUIT.
 * Uma conexão por mensagem (volume baixo; simplicidade vale mais que pool).
 * Partes puras em smtp-core.ts.
 */

const TIMEOUT_MS = 20_000;

class SmtpError extends Error {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

class Session {
  private socket!: net.Socket | tls.TLSSocket;
  private buffer = "";
  private waiters: Array<{ resolve: (r: SmtpReply) => void; reject: (e: Error) => void }> = [];

  constructor(private readonly cfg: SmtpConfig) {}

  private attach(sock: net.Socket | tls.TLSSocket) {
    this.socket = sock;
    sock.setTimeout(TIMEOUT_MS, () => this.fail(new Error("SMTP: tempo esgotado")));
    sock.on("data", (d: Buffer) => this.onData(d.toString("utf8")));
    sock.on("error", (e: Error) => this.fail(e));
    sock.on("close", () => this.fail(new Error("SMTP: conexão encerrada")));
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    for (;;) {
      let parsed: ReturnType<typeof parseReply>;
      try {
        parsed = parseReply(this.buffer);
      } catch (e) {
        return this.fail(e as Error);
      }
      if (!parsed) return;
      this.buffer = parsed.rest;
      this.waiters.shift()?.resolve(parsed.reply);
    }
  }

  private fail(e: Error) {
    const ws = this.waiters;
    this.waiters = [];
    for (const w of ws) w.reject(e);
  }

  private next(): Promise<SmtpReply> {
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }

  async connect(): Promise<void> {
    const { host, port, secure } = this.cfg;
    const sock = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const s = secure ? tls.connect({ host, port, servername: host }, () => resolve(s)) : net.connect({ host, port }, () => resolve(s));
      s.once("error", reject);
    });
    this.attach(sock);
    this.expect(await this.next(), 220);
  }

  private expect(r: SmtpReply, ...codes: number[]): SmtpReply {
    if (!codes.includes(r.code)) throw new SmtpError(`SMTP ${r.code}: ${r.lines.join(" ").slice(0, 200)}`, r.code);
    return r;
  }

  async cmd(line: string, ...codes: number[]): Promise<SmtpReply> {
    const p = this.next();
    this.socket.write(line + "\r\n");
    return this.expect(await p, ...codes);
  }

  async ehlo(): Promise<string[]> {
    const r = await this.cmd("EHLO heeca-mind", 250);
    return r.lines.map((l) => l.toUpperCase());
  }

  async starttls(): Promise<void> {
    await this.cmd("STARTTLS", 220);
    const plain = this.socket as net.Socket;
    plain.removeAllListeners("data");
    plain.removeAllListeners("close");
    const secure = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const s = tls.connect({ socket: plain, servername: this.cfg.host }, () => resolve(s));
      s.once("error", reject);
    });
    this.buffer = "";
    this.attach(secure);
  }

  async auth(caps: string[]): Promise<void> {
    const { user, pass } = this.cfg;
    if (!user || !pass) return;
    const authLine = caps.find((c) => c.startsWith("AUTH ")) ?? "";
    if (authLine.includes("PLAIN")) {
      await this.cmd(`AUTH PLAIN ${authPlain(user, pass)}`, 235);
    } else {
      await this.cmd("AUTH LOGIN", 334);
      await this.cmd(Buffer.from(user).toString("base64"), 334);
      await this.cmd(Buffer.from(pass).toString("base64"), 235);
    }
  }

  async send(from: string, to: string, mime: string): Promise<string> {
    await this.cmd(`MAIL FROM:<${from}>`, 250);
    await this.cmd(`RCPT TO:<${to}>`, 250, 251);
    await this.cmd("DATA", 354);
    const r = await this.cmd(mime + ".", 250);
    return r.lines.join(" ");
  }

  async quit(): Promise<void> {
    try {
      await this.cmd("QUIT", 221);
    } catch {
      /* já fechou */
    }
    this.socket.destroy();
  }

  destroy() {
    this.socket?.destroy();
  }
}

export class SmtpEmailProvider implements EmailProvider {
  readonly name = "smtp";
  private readonly cfg: SmtpConfig;

  constructor(url = process.env.SMTP_URL) {
    if (!url) throw new Error("SMTP_URL é obrigatório com EMAIL_DRIVER=smtp");
    this.cfg = parseSmtpUrl(url);
  }

  async send(msg: EmailMessage): Promise<EmailResult> {
    const from = emailFrom();
    const session = new Session(this.cfg);
    try {
      await session.connect();
      let caps = await session.ehlo();
      if (!this.cfg.secure) {
        if (caps.some((c) => c.startsWith("STARTTLS"))) {
          await session.starttls();
          caps = await session.ehlo();
        } else if (this.cfg.requireTls) {
          throw new SmtpError("Servidor não oferece STARTTLS (use smtps:// ou ?starttls=0 só em desenvolvimento)", 500);
        }
      }
      await session.auth(caps);
      const info = await session.send(addressOf(from), addressOf(msg.to), buildMime({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html }));
      await session.quit();
      return { ok: true, providerMessageId: info.match(/queued as (\S+)/i)?.[1] };
    } catch (e) {
      session.destroy();
      const err = e as Error & { code?: number };
      const retryable = err instanceof SmtpError ? isRetryableCode(err.code) : true; // rede/timeout: tenta de novo
      return { ok: false, error: err.message.slice(0, 300), retryable };
    }
  }
}
