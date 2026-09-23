import { defineConfig } from "@playwright/test";

/**
 * E2E (docs/mind/07-TESTES.md §3). Roda contra `next start` de um build de produção — nunca contra
 * o dev server (Turbopack + testes paralelos = flake). Banco: o mesmo DATABASE_URL do .env; os
 * fixtures criam dados com prefixo `e2e-` e apagam no fim (tests/e2e/global-teardown.ts).
 *
 *   npm run e2e             # build + start + testes
 *   PW_REUSE=1 npm run e2e  # reaproveita um `npm run start` já de pé
 *   E2E_PORT=3530 npm run e2e
 *
 * Porta 3521, não 3000: (a) o Windows (Hyper-V/WSL) reserva faixas dinâmicas a cada reinício e a
 * 3000 pode cair dentro de uma delas — o sintoma é `listen EACCES` no build, não um teste vermelho
 * (`netsh interface ipv4 show excludedportrange protocol=tcp` lista as faixas); (b) esta máquina
 * roda várias sessões de produtos Heeca ao mesmo tempo, e portas redondas colidem — já aconteceu de
 * a suíte do Mind dirigir o app do Nutri e escrever no banco dele. Uma porta por produto.
 *
 * Por isso o global-setup confere a identidade do servidor antes de rodar: com PW_REUSE, responder
 * 200 em /api/health não prova que é ESTE app.
 */
const PORT = process.env.E2E_PORT ?? "3521";
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: BASE,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // .next/dev (tipos gerados pelo dev server) entra no type-check do build e, estale, derruba a suíte.
    command: `node -e "require('fs').rmSync('.next/dev',{recursive:true,force:true})" && npm run build && npm run start -- -p ${PORT}`,
    // NEXT_PUBLIC_APP_URL é embutido no build (URLs de upload/portal) e AUTH_URL decide para onde o
    // Auth.js redireciona depois do login/SSO: os dois precisam seguir a porta, ou o navegador é
    // mandado para a porta do .env e leva ERR_CONNECTION_REFUSED em toda navegação com redirect.
    env: { E2E: "1", PORT, NEXT_PUBLIC_APP_URL: BASE, AUTH_URL: BASE },
    url: `${BASE}/api/health`,
    reuseExistingServer: !!process.env.PW_REUSE,
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
