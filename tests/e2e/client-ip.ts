/**
 * IP que a suíte declara em `x-forwarded-for` (playwright.config.ts) e que os fixtures usam para
 * montar as chaves de rate limit. Fica em arquivo próprio porque é compartilhado entre o config e
 * os fixtures, e o config não pode importar os fixtures (que abrem conexão com o banco).
 *
 * Faixa TEST-NET-3 (RFC 5737), reservada para documentação: nunca é um IP real de alguém.
 */
export const E2E_CLIENT_IP = "203.0.113.10";
