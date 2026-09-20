import "dotenv/config";
import { rotateAllKeys } from "../src/lib/key-rotation";

/**
 * Rotação de ENCRYPTION_KEY.
 *   npm run rotate-key -- --check   só conta o que falta (não grava nada)
 *   npm run rotate-key              recifra tudo com a chave atual
 *
 * Pré-requisito: ENCRYPTION_KEY = chave nova; ENCRYPTION_KEY_PREVIOUS = antiga(s).
 * Rode até "pending: 0" e então remova ENCRYPTION_KEY_PREVIOUS.
 */
const dryRun = process.argv.includes("--check");

rotateAllKeys({ dryRun, log: (l) => console.log("  " + l) })
  .then((r) => {
    const pending = Object.values(r.tables).reduce((n, t) => n + t.pending, 0);
    const failed = Object.values(r.tables).reduce((n, t) => n + t.failed, 0);
    console.log(`\nchave atual: ${r.keyId} · ${dryRun ? "verificação" : "rotação"} concluída · pendentes: ${pending} · falhas: ${failed}`);
    for (const e of r.errors) console.error("  ✖ " + e);
    if (pending === 0 && failed === 0 && !dryRun) console.log("Tudo na chave atual. Pode remover ENCRYPTION_KEY_PREVIOUS.");
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
