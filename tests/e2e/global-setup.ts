import { PRODUCT } from "../../src/lib/heeca/core";
import { cleanupAll, db } from "./fixtures";

/**
 * Confere que o servidor na porta é mesmo ESTE produto, pelo campo `product` do /api/health.
 *
 * Com PW_REUSE, "responde 200 no health" não prova nada: todo produto Heeca tem essa rota. Esta
 * máquina roda várias sessões ao mesmo tempo e já aconteceu de a suíte do Mind dirigir o app do
 * Nutri — testes sem sentido e formulários gravando no banco do outro produto. Falhar aqui, alto e
 * cedo, custa menos do que interpretar o resultado errado.
 *
 * A checagem é pelo `product` (e não pela marca no HTML, primeira versão disto) porque não quebra
 * quando alguém muda o texto da interface. Ideia da sessão do Nutri, que chegou nela em paralelo.
 */
async function assertIsThisApp(baseURL: string) {
  let body: { product?: string };
  try {
    body = (await (await fetch(`${baseURL}/api/health`)).json()) as { product?: string };
  } catch (e) {
    throw new Error(`Não consegui falar com ${baseURL}/api/health: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (body.product !== PRODUCT) {
    throw new Error(
      `O servidor em ${baseURL} responde como "${body.product ?? "produto não identificado"}", não "${PRODUCT}".\n` +
        `Outra sessão desta máquina está nesta porta. Suba este app em outra (E2E_PORT=…) ou pare o outro servidor.`,
    );
  }
}

/** Limpa restos de execuções anteriores antes de começar (o teardown pode não ter rodado). */
export default async function globalSetup() {
  const port = process.env.E2E_PORT ?? "3521";
  await assertIsThisApp(process.env.E2E_BASE_URL ?? `http://localhost:${port}`);
  await cleanupAll();
  await db.$disconnect();
}
