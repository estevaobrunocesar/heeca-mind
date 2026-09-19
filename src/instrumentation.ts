/**
 * Hook de inicialização do Next.js. Roda uma vez por processo, no servidor.
 * Valida o ambiente antes de aceitar tráfego.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnv, envWarnings } = await import("./lib/env");
  const env = validateEnv();
  for (const w of envWarnings(env)) console.warn(`[env] ${w}`);
}
