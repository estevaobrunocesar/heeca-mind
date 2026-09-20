import { z } from "zod";

/**
 * Validação das variáveis de ambiente. Roda uma vez na inicialização
 * (src/instrumentation.ts): erro de configuração derruba o processo com uma
 * mensagem clara, em vez de falhar no primeiro paciente que agendar.
 */

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, "deve ter 32 bytes em base64 (openssl rand -base64 32)");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().url("deve ser uma URL postgresql://"),
    AUTH_SECRET: z.string().min(32, "mínimo de 32 caracteres (openssl rand -base64 32)"),
    ENCRYPTION_KEY: base64Key,
    ENCRYPTION_KEY_PREVIOUS: z
      .string()
      .optional()
      .refine((v) => !v || v.split(",").every((k) => k.trim() === "" || Buffer.from(k.trim(), "base64").length === 32), "cada chave anterior deve ter 32 bytes em base64, separadas por vírgula"),
    NEXT_PUBLIC_APP_URL: z.string().url("deve ser a URL pública com https://"),
    CRON_SECRET: z.string().min(16).optional(),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    EMAIL_DRIVER: z.enum(["console", "smtp", "resend"]).default("console"),
    EMAIL_FROM: z.string().optional(),
    SMTP_URL: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    // Plataforma Heeca (docs/mind/00-DECISAO-E-REUSO.md §4)
    HEECA_PLATFORM_SECRET: z.string().optional(),
    HEECA_PORTAL_URL: z.string().url().optional(),
    WHATSAPP_PROVIDER: z.enum(["console", "notify"]).default("console"),
    NOTIFY_URL: z.string().url().optional(),
    NOTIFY_SECRET: z.string().optional(),
    NOTIFY_PRODUCT: z.string().default("mind"),
  })
  .superRefine((e, ctx) => {
    const prod = e.NODE_ENV === "production";
    const need = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message });
    };
    if (prod) {
      need(e.NEXT_PUBLIC_APP_URL.startsWith("https://"), "NEXT_PUBLIC_APP_URL", "em produção precisa ser https://");
      need(!!e.CRON_SECRET, "CRON_SECRET", "obrigatório em produção (protege /api/cron)");
      need(e.AUTH_SECRET !== "troque-me" && e.ENCRYPTION_KEY !== "troque-me", "AUTH_SECRET", "troque os valores de exemplo");
    }
    if (e.EMAIL_DRIVER === "smtp") need(!!e.SMTP_URL && /^smtps?:\/\//.test(e.SMTP_URL), "SMTP_URL", "EMAIL_DRIVER=smtp exige SMTP_URL (smtp://usuario:senha@host:porta ou smtps://…)");
    if (e.EMAIL_DRIVER === "resend") need(!!e.RESEND_API_KEY, "RESEND_API_KEY", "EMAIL_DRIVER=resend exige RESEND_API_KEY");
    if (e.EMAIL_DRIVER !== "console") need(!!e.EMAIL_FROM && e.EMAIL_FROM.includes("@"), "EMAIL_FROM", "defina o remetente, ex.: Heeca Mind <no-reply@seudominio.com.br>");
    if (e.STORAGE_DRIVER === "s3") {
      need(!!e.S3_BUCKET && !!e.S3_ACCESS_KEY_ID && !!e.S3_SECRET_ACCESS_KEY, "S3_BUCKET", "STORAGE_DRIVER=s3 exige S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY");
    }
    if (e.WHATSAPP_PROVIDER === "notify") {
      need(!!e.NOTIFY_URL, "NOTIFY_URL", "WHATSAPP_PROVIDER=notify exige NOTIFY_URL (https://notify.heeca.com.br)");
      need(!!e.NOTIFY_SECRET && e.NOTIFY_SECRET.length >= 16, "NOTIFY_SECRET", "WHATSAPP_PROVIDER=notify exige NOTIFY_SECRET (= NOTIFY_SECRET_MIND no Notify, ≥ 16)");
    }
    if (e.HEECA_PLATFORM_SECRET) need(e.HEECA_PLATFORM_SECRET.length >= 16, "HEECA_PLATFORM_SECRET", "mínimo de 16 caracteres");
    if (prod) need(!!e.HEECA_PLATFORM_SECRET, "HEECA_PLATFORM_SECRET", "obrigatório em produção (provisionamento e SSO do portal)");
  });

export type Env = z.infer<typeof schema>;

/** `docker run --env-file` não remove aspas (o compose e o dotenv removem). Normaliza. */
function unquote(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    const m = v?.match(/^(["'])([\s\S]*)\1$/);
    out[k] = m ? m[2] : v;
    if (m) process.env[k] = m[2]; // o resto da app lê process.env direto
  }
  return out;
}

/** Lança com todas as falhas listadas. */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const r = schema.safeParse(unquote(source));
  if (r.success) return r.data;
  const lines = r.error.issues.map((i) => `  - ${i.path.join(".") || "(geral)"}: ${i.message}`);
  throw new Error(`Configuração de ambiente inválida:\n${lines.join("\n")}`);
}

/** Avisos não fatais: recursos que ficam em modo degradado. */
export function envWarnings(e: Env): string[] {
  const w: string[] = [];
  if (e.ENCRYPTION_KEY_PREVIOUS?.trim()) w.push("Rotação de chave em andamento (ENCRYPTION_KEY_PREVIOUS definida): rode npm run rotate-key até pendentes = 0 e remova a variável.");
  if (e.EMAIL_DRIVER === "console") w.push("E-mail sem provedor (EMAIL_DRIVER=console): redefinição de senha, convites e avisos ao profissional só vão para o log.");
  if (e.WHATSAPP_PROVIDER !== "notify") w.push("WHATSAPP_PROVIDER=console: mensagens só vão para o log, nada chega ao paciente.");
  if (!e.HEECA_PLATFORM_SECRET) w.push("HEECA_PLATFORM_SECRET ausente: sem provisionamento/SSO do portal; cadastro local ativo.");
  if (e.STORAGE_DRIVER === "local" && e.NODE_ENV === "production") w.push("STORAGE_DRIVER=local em produção: só funciona com filesystem persistente (VPS/Docker com volume), não em serverless.");
  return w;
}
