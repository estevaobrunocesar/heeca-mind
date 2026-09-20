import { defineConfig } from "@playwright/test";

/**
 * E2E (docs/mind/07-TESTES.md §3). Roda contra `next start` de um build de produção — nunca contra
 * o dev server (Turbopack + testes paralelos = flake). Banco: o mesmo DATABASE_URL do .env; os
 * fixtures criam dados com prefixo `e2e-` e apagam no fim (tests/e2e/global-teardown.ts).
 *
 *   npm run e2e            # build + start + testes
 *   PW_REUSE=1 npm run e2e # reaproveita um `npm run start` já de pé na porta 3000
 */
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
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start",
    env: { E2E: "1" },
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !!process.env.PW_REUSE,
    timeout: 600_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
