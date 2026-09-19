# Deploy — Hecca Psico

Dois caminhos, mesmo código. Escolha um.

| | Vercel (serverless) | Docker num VPS |
|---|---|---|
| Banco | Postgres gerenciado com **pooler** (Neon, Supabase, RDS Proxy) | Postgres do `docker-compose.prod.yml` (volume `pg_data`) |
| Arquivos (fotos) | `STORAGE_DRIVER=s3` obrigatório (Cloudflare R2 / S3) | `local` (volume `uploads`) ou `s3` |
| Cron (WhatsApp, expirações, LGPD) | `vercel.json` já agenda `/api/cron` a cada minuto | serviço `cron` do compose |
| TLS | automático | Caddy/Traefik/Nginx na frente de `app:3000` |
| Migrações | `npm run db:deploy` no build ou manualmente | `entrypoint.sh` roda `migrate deploy` a cada start |

## 1. Variáveis de ambiente

Gere os segredos:

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (32 bytes — obrigatório)
openssl rand -hex 24      # CRON_SECRET
```

| Variável | Obrigatória | Observação |
|---|---|---|
| `DATABASE_URL` | sim | Em serverless use a URL **pooled** (`?pgbouncer=true` no Supabase; `-pooler` no Neon). |
| `AUTH_SECRET` | sim | Assina o JWT. Trocar derruba todas as sessões. |
| `ENCRYPTION_KEY` | sim | Cifra notas clínicas e segredos MFA. **Perder = perder os dados cifrados.** Guarde em cofre. Nunca reutilize entre ambientes. |
| `NEXT_PUBLIC_APP_URL` | sim | `https://…` — vai nos links de WhatsApp e no QR do MFA. |
| `CRON_SECRET` | sim (prod) | `Authorization: Bearer` do `/api/cron`. |
| `AUTH_TRUST_HOST` | Docker | `true` atrás de proxy (fora da Vercel). |
| `STORAGE_DRIVER` | | `local` (default) ou `s3`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_URL` | se s3 | R2: `S3_REGION=auto`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_PUBLIC_URL` = domínio público do bucket. Chaves levam prefixo `hecca-psico/` (bucket pode ser compartilhado entre produtos Heeca). |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | para enviar de verdade | Sem elas, mensagens vão para o log. Ver `docs/WHATSAPP.md`. |
| `POSTGRES_PASSWORD` | compose | Senha do Postgres do compose. |

A aplicação **valida tudo isso na inicialização** (`src/lib/env.ts`) e se recusa a subir com configuração inválida, listando cada problema.

## 2. Vercel

1. Importe o repositório; framework Next.js; região `gru1` (já em `vercel.json`).
2. Configure as variáveis acima (Production e Preview).
3. Build command: `npx prisma generate && npx prisma migrate deploy && next build`
   (ou rode `npm run db:deploy` manualmente antes do primeiro deploy).
4. Deploy. O cron passa a chamar `/api/cron` a cada minuto com o `CRON_SECRET`.
5. Aponte o domínio e confira `https://<app>/api/health` → `{"status":"ok","db":"ok"}`.

Limites conhecidos na Vercel: Server Actions até 3 MB (upload da foto já é reduzido no cliente); funções com timeout padrão (o cron processa em lotes de 50).

## 3. Docker / VPS

```bash
git clone … && cd hecca_psico
cp .env.example .env            # preencha; AUTH_TRUST_HOST=true; POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs -f app   # deve mostrar "migrate deploy" e "Ready"
curl -s localhost:3000/api/health
```

Proxy TLS (exemplo Caddy):

```
app.heeca.com.br {
  reverse_proxy 127.0.0.1:3000
}
```

Atualizar: `git pull && docker compose -f docker-compose.prod.yml up -d --build`. As migrações rodam no start.

Backups: `docker compose -f docker-compose.prod.yml exec db pg_dump -U hecca hecca_psico | gzip > backup-$(date +%F).sql.gz` — agende diariamente e copie para fora do servidor. O volume `uploads` também precisa de backup se `STORAGE_DRIVER=local`.

## 4. Primeiro acesso

1. Abra `https://<app>/cadastro` e crie a conta do responsável (vira `OWNER` da organização).
2. Em **Configurações → Segurança**, ative o MFA (recomendado: dados de saúde).
3. **Perfil** (foto, CRP, endereço), **Serviços**, **Horários**, **Políticas**.
4. Se clínica: **Equipe** → nome/slug e convites.
5. Compartilhe `https://<app>/agendar/<slug>` (ou `/clinica/<slug>`).

O seed de desenvolvimento é bloqueado com `NODE_ENV=production`.

## 5. WhatsApp (Meta Cloud API)

Resumo — detalhes e textos dos templates em `docs/WHATSAPP.md`:

1. App Meta com WhatsApp → número → `WHATSAPP_PHONE_NUMBER_ID`; System User com token permanente → `WHATSAPP_ACCESS_TOKEN`.
2. Cadastre os 7 templates (categoria Utility, pt_BR) com os nomes exatos de `src/lib/whatsapp/templates.ts`. Base dos botões de URL: `NEXT_PUBLIC_APP_URL`.
3. Webhook: URL `https://<app>/api/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, assine `messages`. App Secret → `WHATSAPP_APP_SECRET`.
4. Reinicie a aplicação. Em **Mensagens** os envios passam de "log" para status reais (enviada/entregue/lida).

## 6. Checklist antes de abrir para pacientes

- [ ] `/api/health` responde `ok` e o domínio está em HTTPS
- [ ] Cadastro, login, MFA e "sair dos outros dispositivos" funcionam
- [ ] Um agendamento público de teste chega em **Agenda** como "Aguardando confirmação" e a mensagem aparece em **Mensagens**
- [ ] `/api/cron` responde 200 com o `CRON_SECRET` e 401 sem
- [ ] Backup do banco agendado; `ENCRYPTION_KEY` e `AUTH_SECRET` guardados em cofre
- [ ] Política de privacidade e termos publicados (o formulário público cita o consentimento LGPD)
- [ ] Retenção de dados definida em **Políticas** (padrão 5 anos)

## 7. Operação

- Logs de acesso/alteração: tabelas `access_logs` e `audit_logs` (ações `entidade.verbo`).
- Sessões: `user_sessions` — revogue pela UI ou `UPDATE user_sessions SET "revokedAt"=now() WHERE "userId"=…`.
- Rotação de `ENCRYPTION_KEY`: não há rotação automática. Decifre com a antiga e recifre com a nova (`src/lib/crypto.ts`) antes de trocar a variável.
