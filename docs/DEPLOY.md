# Deploy — Heeca Mind

Dois caminhos, mesmo código. Escolha um.

| | Vercel (serverless) | Docker num VPS |
|---|---|---|
| Banco | Postgres gerenciado com **pooler** (Neon, Supabase, RDS Proxy) | Postgres do `docker-compose.prod.yml` (volume `pg_data`) |
| Arquivos (fotos, documentos clínicos) | `STORAGE_DRIVER=s3` obrigatório (Cloudflare R2 / S3) | `local` (volumes `uploads` e `private`) ou `s3` |
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
| `ENCRYPTION_KEY` | sim | Cifra notas clínicas, documentos, respostas de formulários e segredos MFA. **Perder = perder os dados cifrados.** Guarde em cofre. Nunca reutilize entre ambientes. |
| `EMAIL_DRIVER` | | `console` (log), `smtp` ou `resend`. Sem provedor, reset de senha, convites e avisos ao profissional só vão para o log. |
| `EMAIL_FROM` | com e-mail | Remetente, ex.: `Heeca Mind <no-reply@seudominio.com.br>` (domínio com SPF/DKIM no provedor). |
| `SMTP_URL` | smtp | `smtps://usuario:senha@host:465` ou `smtp://usuario:senha@host:587` (STARTTLS). Teste: `SMTP_CHECK_TO=voce@x.com npx tsx --conditions=react-server scripts/smtp-check.ts`. |
| `RESEND_API_KEY` | resend | Chave da API do Resend. |
| `ENCRYPTION_KEY_PREVIOUS` | | Só durante uma rotação: chave(s) antiga(s), separadas por vírgula, para decifrar. Ver seção 7. |
| `NEXT_PUBLIC_APP_URL` | sim | `https://…` — vai nos links de WhatsApp e no QR do MFA. |
| `CRON_SECRET` | sim (prod) | `Authorization: Bearer` do `/api/cron`. |
| `AUTH_TRUST_HOST` | Docker | `true` atrás de proxy (fora da Vercel). |
| `STORAGE_DRIVER` | | `local` (default) ou `s3`. |
| `PRIVATE_STORAGE_DIR` | | Driver local: pasta dos documentos clínicos (blobs cifrados). Default `./storage/private`, fora de `public/`. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_PUBLIC_URL` | se s3 | R2: `S3_REGION=auto`, `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_PUBLIC_URL` = domínio público do bucket. Chaves levam prefixo `mind/` (bucket pode ser compartilhado entre produtos Heeca). |
| `HEECA_PLATFORM_SECRET`, `HEECA_PORTAL_URL` | **obrigatório em produção** | Segredo compartilhado com o portal (`Product.provisionSecret` do catálogo `mind`): assina `/api/heeca/provision`, `/api/heeca/entitlement` e o JWT de `/sso/heeca`. Com ele, `/cadastro` redireciona para o portal. |
| `WHATSAPP_PROVIDER`, `NOTIFY_URL`, `NOTIFY_SECRET`, `NOTIFY_PRODUCT` | para enviar de verdade | `notify` + `https://notify.heeca.com.br` + `NOTIFY_SECRET_MIND` do Notify + `mind`. `console` só loga. Nenhum token da Meta neste app. Ver `docs/WHATSAPP.md`. |
| `POSTGRES_PASSWORD` | compose | Senha do Postgres do compose. |

A aplicação **valida tudo isso na inicialização** (`src/lib/env.ts`) e se recusa a subir com configuração inválida, listando cada problema.

## 2. Vercel

1. Importe o repositório; framework Next.js; região `gru1` (já em `vercel.json`).
2. Configure as variáveis acima (Production e Preview).
3. Build command: `npx prisma generate && npx prisma migrate deploy && next build`
   (ou rode `npm run db:deploy` manualmente antes do primeiro deploy).
4. Deploy. O cron passa a chamar `/api/cron` a cada minuto com o `CRON_SECRET`.
5. Aponte o domínio e confira `https://<app>/api/health` → `{"status":"ok","db":"ok"}`.

Limites conhecidos na Vercel: Server Actions até 10 MB no `next.config.ts` (a foto é reduzida no cliente; documentos clínicos até 8 MB — confira o limite de body do plano); funções com timeout padrão (o cron processa em lotes de 50).

## 3. Docker / VPS

```bash
git clone … && cd heeca_mind
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

Backups: `docker compose -f docker-compose.prod.yml exec db pg_dump -U hecca heeca_mind | gzip > backup-$(date +%F).sql.gz` — agende diariamente e copie para fora do servidor. Os volumes `uploads` e `private` também precisam de backup se `STORAGE_DRIVER=local`. Os blobs de `private` são cifrados com `ENCRYPTION_KEY`: sem a chave, o backup é inútil; sem o backup do banco (linha com `storageKey`), o blob é inalcançável.

## 4. Primeiro acesso

1. Abra `https://<app>/cadastro` e crie a conta do responsável (vira `OWNER` da organização).
2. Em **Configurações → Segurança**, ative o MFA (recomendado: dados de saúde).
3. **Perfil** (foto, CRP, endereço), **Serviços**, **Horários**, **Políticas**.
4. Se clínica: **Equipe** → nome/slug e convites.
5. Compartilhe `https://<app>/agendar/<slug>` (ou `/clinica/<slug>`).

O seed de desenvolvimento é bloqueado com `NODE_ENV=production`.

## 5. Plataforma Heeca (portal e Notify)

O Mind é um produto do portal heeca.com.br — não vende, não cobra e não fala com a Meta (docs/mind/00-DECISAO-E-REUSO.md). O que o **chat da plataforma** faz ao colocar o Mind na prateleira, na ordem:

1. Catálogo: `Product` `mind` com `provisionUrl = https://mind.heeca.com.br/api/heeca` e `provisionSecret` = `HEECA_PLATFORM_SECRET` deste app (`PRODUCT_MIND_*` no env do portal).
2. Notify: `NOTIFY_SECRET_MIND` no Notify = `NOTIFY_SECRET` daqui; `mind` na lista de produtos do `validateTemplate`; templates `heeca_mind_*` de `src/lib/whatsapp/templates.ts` no catálogo e na Meta (base de URL = `NEXT_PUBLIC_APP_URL`).
3. Portal: redirecionador `/a/mind/<slug>` → `https://mind.heeca.com.br/agendar/<slug>` (botão dos templates unificados).
4. R2: bucket `heeca-mind` (privado) + token → `STORAGE_DRIVER=s3`, `S3_*`.
5. Coolify: app `heeca-mind` + `heeca-mind-db`, variáveis acima, cron `/api/cron`, DNS `mind.heeca.com.br`, monitor.

Validação sem o portal, em qualquer ambiente (`npm run heeca:sim`, assina como o portal/Notify com os segredos do `.env`):

```bash
npm run heeca:sim -- provision bruno@exemplo.com          # 200 + tenantId; repetir devolve o mesmo tenant
npm run heeca:sim -- entitlement sub_sim_bruno_exemplo_com blocked   # app inteiro cai em /bloqueado
npm run heeca:sim -- sso sub_sim_bruno_exemplo_com bruno@exemplo.com  # abre a URL impressa; segunda vez = token já utilizado
npm run heeca:sim -- notify button +5511999990000 confirm:<token>     # confirma a sessão como um clique no WhatsApp
```

## 6. Checklist antes de abrir para pacientes

- [ ] `/api/health` responde `ok` e o domínio está em HTTPS
- [ ] Cadastro, login, MFA e "sair dos outros dispositivos" funcionam
- [ ] Um agendamento público de teste chega em **Agenda** como "Aguardando confirmação" e a mensagem aparece em **Mensagens**
- [ ] `/api/cron` responde 200 com o `CRON_SECRET` e 401 sem
- [ ] E-mail real chega: `SMTP_CHECK_TO=voce@… npx tsx --conditions=react-server scripts/smtp-check.ts` (e "Esqueci minha senha" entrega o link)
- [ ] Backup do banco agendado; `ENCRYPTION_KEY` e `AUTH_SECRET` guardados em cofre
- [ ] Política de privacidade e termos publicados (o formulário público cita o consentimento LGPD)
- [ ] Retenção de dados definida em **Políticas** (padrão 5 anos)

## 7. Operação

- Logs de acesso/alteração: tabelas `access_logs` e `audit_logs` (ações `entidade.verbo`).
- Sessões: `user_sessions` — revogue pela UI ou `UPDATE user_sessions SET "revokedAt"=now() WHERE "userId"=…`.
- Rotação de `ENCRYPTION_KEY` (sem parada, sem perda):
  1. Gere a nova: `openssl rand -base64 32`.
  2. Defina `ENCRYPTION_KEY=<nova>` e `ENCRYPTION_KEY_PREVIOUS=<antiga>` (várias antigas: separadas por vírgula). Faça o deploy. A partir daqui tudo que é novo é cifrado com a nova; o antigo continua legível.
  3. `npm run rotate-key -- --check` mostra quantos registros ainda estão na antiga (não grava nada). `npm run rotate-key` recifra notas, respostas de formulário, segredos MFA e documentos (campos + blob no storage). Idempotente: pode repetir; pode rodar com o app no ar.
  4. Quando terminar com `pendentes: 0 · falhas: 0`, remova `ENCRYPTION_KEY_PREVIOUS` e faça o deploy. A chave antiga pode ser destruída.
  Enquanto `ENCRYPTION_KEY_PREVIOUS` existir, o app registra um aviso no boot. No Docker: `docker compose -f docker-compose.prod.yml exec app node prisma-cli/...` não serve — rode o script numa máquina com o código e as duas variáveis (`npx tsx --conditions=react-server scripts/rotate-key.ts`), apontando para o banco e o storage de produção.
  Se uma chave for **perdida** antes da rotação terminar, os registros que ainda estavam nela são irrecuperáveis — por isso o `--check` antes de apagar qualquer chave.
