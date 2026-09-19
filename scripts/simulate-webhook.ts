import "dotenv/config";
import { signMetaBody } from "../src/lib/whatsapp/signature";

/**
 * Simula eventos do webhook da Meta contra o servidor local.
 *
 *   npm run webhook:sim -- status <wamid> read
 *   (BASE_URL=http://localhost:3001 para outra porta)
 *   npm run webhook:sim -- message +5521988887777 "sim"
 */
const [kind, a, b] = process.argv.slice(2);
const base = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const secret = process.env.WHATSAPP_APP_SECRET;
if (!secret) throw new Error("WHATSAPP_APP_SECRET não definido no .env");

let value: unknown;
if (kind === "status") {
  value = { statuses: [{ id: a, status: b ?? "delivered", timestamp: String(Math.floor(Date.now() / 1000)), recipient_id: "5511999999999" }] };
} else if (kind === "message") {
  value = {
    messages: [
      { id: `wamid.sim.${Date.now()}`, from: a.replace(/\D/g, ""), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: b ?? "sim" } },
    ],
  };
} else {
  throw new Error("uso: status <wamid> <sent|delivered|read|failed> | message <telefone> <texto>");
}

const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "0", changes: [{ field: "messages", value }] }] });
const sig = signMetaBody(body, secret);

fetch(`${base}/api/webhooks/whatsapp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sig },
  body,
})
  .then(async (r) => {
    console.log(r.status, await r.text());
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
