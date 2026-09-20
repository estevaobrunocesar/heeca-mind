import "dotenv/config";
import net from "node:net";
import { SmtpEmailProvider } from "../src/lib/email/smtp";

/**
 * Verificação do cliente SMTP contra um servidor falso em memória (sem TLS,
 * AUTH LOGIN), ou contra um servidor real se SMTP_URL e SMTP_CHECK_TO estiverem
 * definidos:  npx tsx --conditions=react-server scripts/smtp-check.ts
 */
async function fakeServer(): Promise<{ port: number; received: () => string; close: () => void }> {
  let data = "";
  const server = net.createServer((sock) => {
    const w = (s: string) => sock.write(s + "\r\n");
    let inData = false;
    let authStep = 0;
    w("220 fake.local ESMTP");
    sock.on("data", (buf) => {
      for (const line of buf.toString().split("\r\n")) {
        if (!line && !inData) continue;
        if (inData) {
          if (line === ".") {
            inData = false;
            w("250 2.0.0 Ok: queued as FAKE123");
          } else data += line + "\n";
          continue;
        }
        const u = line.toUpperCase();
        if (u.startsWith("EHLO")) { w("250-fake.local"); w("250 AUTH LOGIN"); }
        else if (u === "AUTH LOGIN") { authStep = 1; w("334 VXNlcm5hbWU6"); }
        else if (authStep === 1) { authStep = 2; w("334 UGFzc3dvcmQ6"); }
        else if (authStep === 2) { authStep = 0; w(Buffer.from(line, "base64").toString() === "segredo" ? "235 ok" : "535 auth failed"); }
        else if (u.startsWith("MAIL FROM")) w("250 ok");
        else if (u.startsWith("RCPT TO")) w("250 ok");
        else if (u === "DATA") { inData = true; w("354 go"); }
        else if (u === "QUIT") { w("221 bye"); sock.end(); }
        else w("500 ?");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { port: (server.address() as net.AddressInfo).port, received: () => data, close: () => server.close() };
}

async function main() {
  const checks: Array<[string, boolean]> = [];
  const fake = await fakeServer();
  try {
    const ok = new SmtpEmailProvider(`smtp://ana:segredo@127.0.0.1:${fake.port}?starttls=0`);
    const r = await ok.send({ to: "dest@exemplo.com", subject: "Sessão amanhã", text: "Olá, João.\n.linha com ponto" });
    checks.push(["envio ok com AUTH LOGIN", r.ok]);
    checks.push(["id da fila capturado", r.ok && r.providerMessageId === "FAKE123"]);
    const got = fake.received();
    checks.push(["cabeçalho Subject codificado", got.includes("Subject: =?UTF-8?B?")]);
    checks.push(["corpo em base64 decodifica", Buffer.from(got.split("\n\n")[1]?.replace(/\s/g, "") ?? "", "base64").toString().includes("linha com ponto")]);

    const bad = new SmtpEmailProvider(`smtp://ana:errada@127.0.0.1:${fake.port}?starttls=0`);
    const r2 = await bad.send({ to: "dest@exemplo.com", subject: "x", text: "y" });
    checks.push(["senha errada → falha definitiva (535, não retryable)", !r2.ok && r2.retryable === false && /535/.test(r2.error)]);

    const strict = new SmtpEmailProvider(`smtp://ana:segredo@127.0.0.1:${fake.port}`);
    const r3 = await strict.send({ to: "dest@exemplo.com", subject: "x", text: "y" });
    checks.push(["sem STARTTLS e sem opt-in → recusa", !r3.ok && /STARTTLS/.test(r3.error)]);

    const down = new SmtpEmailProvider(`smtp://127.0.0.1:1?starttls=0`);
    const r4 = await down.send({ to: "dest@exemplo.com", subject: "x", text: "y" });
    checks.push(["servidor fora → erro retryable", !r4.ok && r4.retryable === true]);
  } finally {
    fake.close();
  }

  if (process.env.SMTP_URL && process.env.SMTP_CHECK_TO) {
    const real = new SmtpEmailProvider();
    const r = await real.send({ to: process.env.SMTP_CHECK_TO, subject: "Heeca Mind — teste de SMTP", text: "Se você recebeu isto, o SMTP_URL está correto." });
    checks.push([`servidor real (${process.env.SMTP_CHECK_TO})`, r.ok]);
    if (!r.ok) console.error("  ", r.error);
  }

  for (const [label, ok] of checks) console.log(ok ? "✔" : "✖", label);
  process.exit(checks.some(([, ok]) => !ok) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
