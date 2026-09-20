# 00 — Decisão de base e proposta de reutilização do Core

## 1. Decisão (20/09/2026)

**O Heeca Mind é o `hecca_psico` rebatizado e integrado à plataforma.** Não é um app novo nem um clone do motor Dental.

Motivos, verificados no código:

| Critério | `hecca_psico` | Motor Dental (`heeca_consulta`) | Do zero |
|---|---|---|---|
| Critérios de aceite do MVP (§41) já cobertos | 17 de 18 | ~11 de 18 (falta recorrência semanal, sessão online, cifra clínica, delegação, LGPD/CFP) | 0 |
| Separação administrativo × clínico (§35) | Cifra AES-GCM em `ClinicalNote.contentEnc`, `ClinicalAccessLog` separado do `AuditLog`, escopos por delegação | Visibilidade por permissão (`view_all`) sobre dado em claro | — |
| Peso morto para psicologia | nenhum | odontograma, orçamento versionado, convênios, caixa, contas a pagar (~40% de 163 mil linhas) | — |
| Integração com o Core (portal, Notify, R2) | **não tem** | tem (referência a copiar) | não tem |
| Testes | 19 suítes (disponibilidade, permissões, cifra, TOTP, retenção, formulários…) | muitas | 0 |
| Viola §42 ("não duplicar agenda, CRM, auth")? | não | não | **sim** |

Consequência para o mapa da plataforma: em `heeca_site/src/lib/ecosystem.ts` a família Saúde diz que o motor Health é o Dental e que Mind/Nutri/Fono nascem dele. **Proposta**: o Health passa a ter dois motores — *Dental* (procedimento, odontograma, orçamento) e *Mind* (sessão, recorrência, prontuário cifrado, delegação). Nutri e Fono são mais parecidos com Mind do que com Dental. Isso é tarefa da plataforma (ajustar `MOTORES_COMPARTILHADOS` e `G6` do `PENDENCIAS.md`), não deste repo.

## 2. O que o briefing chama de "Core" e o que existe de fato

O briefing (§4) descreve Auth, Tenant, CRM, Schedule, Notify, Billing, Files, Reports, AI como serviços. Na plataforma real (`PENDENCIAS.md`, `ecosystem.ts` → `MOTORES_COMPARTILHADOS`, `infra/README.md`) a divisão é outra. A tabela abaixo é a **proposta de reutilização** pedida no §43:

| Módulo do briefing | O que existe hoje | O Mind reutiliza assim | Estado no Psico |
|---|---|---|---|
| **Heeca Auth** (login, MFA, sessões) | Portal = conta Heeca + **SSO por JWT HS256** para cada produto. O login local, MFA e sessões ficam **dentro** de cada produto | `GET /sso/heeca?token=` (validar `aud="mind"`, `exp` 60 s, criar/achar `User` pelo e-mail, `Membership` no tenant, sessão local). Login local, MFA TOTP e revogação de sessão **já existem** e continuam | novo: rota SSO; existe: `src/auth.ts`, `src/lib/mfa/`, `user_sessions` |
| **Heeca Tenant** (empresa, isolamento, multiempresa) | Portal provisiona; cada produto tem **container, Postgres, segredo e bucket próprios**; isolamento por `tenantId` em cada query | `POST /api/heeca/provision` cria `Organization` + `User` OWNER + `Professional` (idempotente por `subscriptionId`); `Organization` ganha `heecaSubscriptionId`/`heecaAccountId` | novo: rota + campos; existe: `src/lib/tenant.ts`, `organizationId` em toda entidade |
| **Heeca Billing** (assinatura, planos) | Portal (Asaas, faturas, entitlement) | `POST /api/heeca/entitlement` espelha `status/plan/limits` em `Organization`; gate `/bloqueado` quando `access=blocked`; tela de assinatura vira link para `{HEECA_PORTAL_URL}/conta`. **O produto não cobra o profissional.** Cobrança do *paciente* (Pix/sinal) é outra coisa — fica no produto | novo |
| **Heeca Notify** (WhatsApp, lembretes) | Serviço real `notify.heeca.com.br`: fila, retry, opt-out global, cota, callbacks assinados, **7 templates unificados** | Trocar o provider Meta direto por `NotifyWhatsAppProvider` (`POST /api/v1/messages` com HMAC `NOTIFY_SECRET_MIND`); receber callbacks em `/api/webhooks/notify`; mapear `NotificationType` → templates unificados + específicos `heeca_mind_*` | novo: provider + rota de callback; existe: fila `Notification`, dispatcher com claim atômico, respostas (`replies.ts`), templates fechados |
| **Heeca Files** | R2, **um bucket e um token por produto**; storage privado para clínico | `STORAGE_DRIVER=s3` com `R2_MIND_*`; prefixo de chave `hecca-psico/` → `mind/`; blobs clínicos continuam cifrados antes do upload | existe: `src/lib/storage/` (local + S3 SigV4); plataforma: bucket + token |
| **Heeca CRM** (clientes, tags, histórico) | Não é serviço; vive em cada produto (extração = melhoria geral D8) | `Patient` + `adminNotes` + `followUpStatus`; **tags** são novas | existe (sem tags) |
| **Heeca Schedule** (agenda, disponibilidade, recorrência) | Não é serviço; o "motor Schedule" (`heeca_beauty`) é código de outra família | `src/lib/availability.ts` (puro, testado), `RecurringSeries`, `appointment-status.ts`, lista de espera | existe |
| **Heeca Reports** | Não é serviço | Dashboard e `/financeiro` existem; relatórios do §27 são novos | parcial |
| **Heeca Admin** | Portal `/admin` (catálogo, contas, monitor, ecossistema) | Catálogo `mind`, `PRODUCT_MIND_*`, monitor, prateleira | plataforma |
| **Heeca AI** | Reservado | Nada no MVP. Regra do §34: IA nunca toca `ClinicalNote`/`ClinicalDocument`/`FormRequest.answersEnc` | — |
| **UI padrão Heeca** | `ui/` (`@heeca/ui`: `tokens.css`, `layout.md`, primitivos) | `data-accent="mind"` (cor a definir pelo kit de marca), casca topbar branca + filete, sidebar clara | novo: adotar o kit (hoje o Psico tem UI própria em Tailwind 4) |

## 3. Divisão de trabalho (regra da Fase G)

**Este repositório (chat Mind) faz:**
1. Renomear produto: `Hecca Psico` → `Heeca Mind` em UI, e-mails, `EMAIL_FROM`, prefixo de storage, `package.json`, `docs/`.
2. `src/lib/heeca/` (provision, entitlement, SSO) — copiar a forma de `heeca_consulta/src/server/heeca/service.ts` (157 linhas).
3. Provider Notify + callback + mapeamento de templates.
4. Gaps do briefing (`06-GAPS-E-PLANO.md`).
5. `docs/DEPLOY.md` atualizado com as variáveis novas.
6. Avisar o chat da plataforma quando o repo estiver pronto.

**O chat da plataforma faz** (nunca este repo): `Product` `mind` no catálogo + `PRODUCT_COPY.mind` + planos/preços; `NOTIFY_SECRET_MIND` no Notify; `R2_MIND_*`; `heeca-mind` no `github.mjs`, `dns.mjs` (`mind.heeca.com.br`), `coolify-setup.mjs` (app + `heeca-mind-db` + vars); `data-accent="mind"` em `ui/tokens.css`; monitor; templates `heeca_mind_*` em `heeca_notify/src/lib/templates.ts` e `TEMPLATES-META.md`; ajuste do `ecosystem.ts`.

## 4. Variáveis de ambiente novas (contrato com `coolify-setup.mjs`)

```
HEECA_PLATFORM_SECRET      # HMAC do portal (provision/entitlement) e chave do JWT de SSO
HEECA_PORTAL_URL           # https://heeca.com.br
WHATSAPP_PROVIDER          # notify | console  (substitui as 4 variáveis da Meta)
NOTIFY_URL                 # https://notify.heeca.com.br
NOTIFY_SECRET              # = NOTIFY_SECRET_MIND no Notify
NOTIFY_PRODUCT             # mind
R2_*/S3_*                  # bucket heeca-mind (privado), STORAGE_DRIVER=s3
```

Mantidas: `ENCRYPTION_KEY(+_PREVIOUS)`, `AUTH_SECRET`, `CRON_SECRET`, `SMTP_URL`/`EMAIL_*`, `PRIVATE_STORAGE_DIR`.

## 5. O que NÃO fazer (reafirmando o §42 com nomes reais)

- Não criar segunda tela/serviço de cobrança do profissional — o portal é dono (`getBillingState().managedByPortal` no Dental é o padrão).
- Não guardar token da Meta no Mind — só o Notify fala com a Meta.
- Não criar bucket compartilhado — "cada produto é individual" (D12).
- Não trocar o mecanismo de acesso clínico do Psico pelo do Dental — o do Psico é mais forte e é exatamente o §35.
- Não misturar `Patient` (CRM) com `ClinicalNote`/`ClinicalDocument`/`FormRequest.answersEnc` — já são tabelas e caminhos de código separados; manter.
