import "dotenv/config";
import { purgeRateLimits, rateLimit, rateLimitAll } from "../src/lib/rate-limit";

// Verificação de integração contra o banco local: npx tsx --conditions=react-server scripts/rate-limit-check.ts
async function main() {
  const rule = { scope: `test:${Date.now()}`, limit: 3, windowSeconds: 2 };

  const r1 = await rateLimit(rule, "1.2.3.4");
  const r2 = await rateLimit(rule, "1.2.3.4");
  const r3 = await rateLimit(rule, "1.2.3.4");
  const r4 = await rateLimit(rule, "1.2.3.4");
  console.log("3 permitidos, 4º bloqueado:", [r1.ok, r2.ok, r3.ok, r4.ok].join(","), "| restantes:", r1.remaining, r2.remaining, r3.remaining, r4.remaining, "| retry:", r4.retryAfterSeconds + "s");

  const other = await rateLimit(rule, "5.6.7.8");
  console.log("outro identificador não é afetado:", other.ok);

  // Concorrência: 10 requisições simultâneas, só `limit` passam.
  const burst = { scope: `burst:${Date.now()}`, limit: 5, windowSeconds: 60 };
  const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit(burst, "same")));
  console.log("10 simultâneas com limite 5 → permitidas:", results.filter((r) => r.ok).length);

  await new Promise((r) => setTimeout(r, 2100));
  const after = await rateLimit(rule, "1.2.3.4");
  console.log("após a janela reabre:", after.ok, "| restantes:", after.remaining);

  const all = await rateLimitAll([{ rule: { ...rule, scope: "all" }, identifier: "x" }, { rule: { ...rule, scope: "all2", limit: 0 }, identifier: "y" }]);
  console.log("rateLimitAll bloqueia se qualquer regra estoura:", !all.ok);

  const purged = await purgeRateLimits(0);
  console.log("purge removeu linhas:", purged > 0);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
