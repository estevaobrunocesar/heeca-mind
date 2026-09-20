# Heeca Mind → chat da plataforma: o que falta para a prateleira

Data: 20/09/2026. Repositório: `hecca_psico` (branch `master`, merge `0b3ebdf`), a renomear para `heeca-mind`.
Produto pronto no código: 18/18 critérios do §41 do briefing; 190 testes; `check:tenant` e `check:lgpd` verdes.

## Decisão que muda o mapa (D9)

O Mind **não** nasce do motor Dental: é o `hecca_psico` integrado ao Core. Proposta: em `heeca_site/src/lib/ecosystem.ts`, `MOTORES_COMPARTILHADOS` → Health com dois motores — *Dental* (procedimento, odontograma, orçamento) e *Mind* (sessão, recorrência, prontuário cifrado, delegação). Nutri e Fono nascem do Mind. Atualizar o item G6 do `PENDENCIAS.md`.

## Checklist (na ordem)

1. **Repo/GitHub**: renomear `hecca_psico` → `heeca-mind`; liberar no GitHub App `heeca`; `heeca-mind` no `infra/github.mjs`.
2. **Catálogo do portal**: `Product` `mind` (nome de prateleira **Heeca Mind**), planos/preços (Bruno), `PRODUCT_COPY.mind`, `PRODUCT_MIND_*` no env do portal, `provisionUrl = https://mind.heeca.com.br/api/heeca`, `provisionSecret` = `HEECA_PLATFORM_SECRET` do app. Contrato implementado: `POST /provision` (idempotente por `subscriptionId`), `POST /entitlement`, `GET /sso/heeca` (aud `mind`). `segment` aceito: `psychology|therapy` (autônomo) ou `clinic` (admin sem perfil).
3. **Notify**:
   - `NOTIFY_SECRET_MIND` (≥ 32) — vai para o app como `NOTIFY_SECRET`; app usa `WHATSAPP_PROVIDER=notify`, `NOTIFY_URL`, `NOTIFY_PRODUCT=mind`.
   - Adicionar `mind` à regex de produtos do `validateTemplate` em `heeca_notify/src/lib/templates.ts` (hoje `heeca_mind_*` é recusado).
   - Cadastrar 8 templates específicos (textos de referência em `hecca_psico/src/lib/whatsapp/templates.ts`, base de URL = `https://mind.heeca.com.br`):
     `heeca_mind_lembrete_2h`, `heeca_mind_sessao_online` (URL `/confirmar/`), `heeca_mind_lista_espera`, `heeca_mind_oferta_horario` (URL `/confirmar/`), `heeca_mind_formulario` (URL `/formulario/`), `heeca_mind_documento` (URL `/documento/`), `heeca_mind_acesso_portal` (URL `/portal/entrar/`), `heeca_mind_pesquisa` (URL `/pesquisa/`).
   - Unificados usados sem mudança: `heeca_confirmacao`, `heeca_confirmado`, `heeca_lembrete`, `heeca_cancelado`, `heeca_remarcado`, `heeca_retorno`. Callback do app: `https://mind.heeca.com.br/api/webhooks/notify`.
4. **Portal — redirecionador**: `/a/mind/<slug>` → `https://mind.heeca.com.br/agendar/<slug>` (botões dos unificados `heeca_cancelado` e `heeca_retorno`).
5. **R2**: bucket privado `heeca-mind` + token → `STORAGE_DRIVER=s3`, `S3_*` (prefixo de chave `mind/`).
6. **Coolify**: app `heeca-mind` (Dockerfile, standalone, `docker/entrypoint.sh` roda `migrate deploy`) + `heeca-mind-db` (Postgres 16) + Scheduled Task `GET /api/cron` com `Bearer CRON_SECRET` a cada minuto. Variáveis completas em `docs/DEPLOY.md`. Obrigatórias em produção: `HEECA_PLATFORM_SECRET`, `ENCRYPTION_KEY` (32 bytes base64 — **guardar fora do banco**), `AUTH_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_APP_URL=https://mind.heeca.com.br`, SMTP Resend (`EMAIL_DRIVER=smtp`, `SMTP_URL`, `EMAIL_FROM="Heeca Mind <no-reply@heeca.com.br>"`).
7. **DNS**: `mind.heeca.com.br` no `infra/dns.mjs`. Monitor: alvo `https://mind.heeca.com.br/api/health`.
8. **UI kit**: `data-accent="mind"` em `ui/tokens.css` quando o kit de marca definir a cor (hoje o app usa sálvia `#5f7a6a` provisória em `--primary`).
9. **Provisionamento sintético** depois do deploy: o app tem simulador (`npm run heeca:sim`), mas em produção use o portal; o `/api/heeca/provision` sem assinatura deve responder 401.

## Segredos gerados pelo app (não pela plataforma)

Nenhum. Todos os segredos são da plataforma (`production.env` → `coolify-setup apply`).

## Contato

Dúvidas técnicas: `hecca_psico/CLAUDE.md` (guia do repo) e `docs/mind/` (arquitetura, ERD, fluxos, API, segurança, plano, testes).
