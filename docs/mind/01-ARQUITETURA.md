# 01 — Arquitetura

## 1. Visão geral

```
                         ┌────────────────────────────────────────────┐
                         │  heeca.com.br (PORTAL = Heeca Core)        │
  profissional ─────────►│  conta · assinatura (Asaas) · catálogo     │
  (compra o Mind)        │  SSO JWT · admin · monitor · /a/ /p/ redir │
                         └──────┬──────────────────┬──────────────────┘
                                │ provision /       │ SSO (navegador)
                                │ entitlement (HMAC)│ JWT 60 s
                                ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  mind.heeca.com.br  — HEECA MIND (Next.js 16, container próprio)        │
│                                                                         │
│  src/app/(auth)      login · mfa · recuperar · convite                  │
│  src/app/(app)       dashboard · agenda · pacientes · serviços ·        │
│                      pacotes · documentos · financeiro · relatórios ·   │
│                      mensagens · configurações · [clínico]              │
│  src/app/agendar     página pública + agendamento + lista de espera     │
│  src/app/portal      portal do paciente (novo)                          │
│  src/app/api         heeca/{provision,entitlement} · sso/heeca ·        │
│                      webhooks/notify · cron · health                    │
│                                                                         │
│  src/lib             tenant · session · permissions · availability ·    │
│                      appointment-status · notifications · clinical ·    │
│                      crypto · lgpd · mfa · storage · whatsapp · heeca   │
├──────────────┬──────────────────────┬───────────────────────────────────┤
│ Postgres 16  │ R2 bucket heeca-mind │ cron (curl /api/cron a cada 1 min)│
│ heeca-mind-db│ (privado; clínico já │ dispatcher · expiração · LGPD ·   │
│              │  chega cifrado)      │ recorrência · lista de espera     │
└──────────────┴──────────────────────┴───────────────────────────────────┘
        │ POST /api/v1/messages (HMAC NOTIFY_SECRET_MIND)      ▲ callback assinado
        ▼                                                      │ (status, botão, texto)
┌──────────────────────────────────┐                  ┌────────┴────────┐
│ notify.heeca.com.br (Core)       │ ◄── Meta Cloud ──┤ paciente        │
│ fila · templates · opt-out · cota│      API (WABA)  │ (WhatsApp)      │
└──────────────────────────────────┘                  └─────────────────┘
        │ SMTP Resend (smtps://…:2465)  — e-mail transacional e avisos ao profissional
```

Um container, um banco, um bucket, um segredo por produto — padrão da plataforma (`infra/README.md`, D12). Nada do Mind é compartilhado com outro produto além do portal e do Notify.

## 2. Serviços e responsabilidades

| Serviço | Dono | Responsabilidade | O Mind depende para |
|---|---|---|---|
| Portal | plataforma | conta, assinatura, cobrança do profissional, SSO, catálogo, redirecionador `/a/` `/p/` dos botões de WhatsApp | existir como tenant; saber se está pago; entrar sem senha |
| Notify | plataforma | entregar WhatsApp, retry, opt-out, cota, webhook da Meta | toda mensagem ao paciente |
| Resend (SMTP) | plataforma | e-mail | reset de senha, convite, avisos ao profissional |
| Postgres `heeca-mind-db` | Mind | todos os dados; backup diário 03:00 UTC → R2 `heeca-backups` (padrão Coolify) | tudo |
| R2 `heeca-mind` | Mind | foto do profissional (pública via URL assinada ou `S3_PUBLIC_URL`), documentos clínicos cifrados, PDFs de documentos administrativos | anexos |
| Cron (Coolify scheduled task) | Mind | `GET /api/cron` com `Bearer CRON_SECRET` a cada minuto | fila, expirações, LGPD, geração de recorrência, formulários automáticos, sync da lista de espera |

**Falhas toleradas**: Notify fora → mensagens ficam `QUEUED` e o dispatcher tenta depois (já existe, com backoff). Portal fora → nada muda no Mind (entitlement é espelho; SSO indisponível → login local continua). R2 fora → upload falha com erro claro; leitura de foto degrada.

## 3. Camadas dentro do app (já são assim no Psico; manter)

```
UI (Server Components + Server Actions, useActionState)
  │  requireActor()  → Actor { userId, organizationId, role, professionalId, activeProfessionalId }
  ▼
Permissões (src/lib/permissions.ts — funções puras, sem banco)
  │  canManageSchedule · canViewFinancials · canAccessClinicalData · canEditProfessional …
  ▼
Regras puras testadas (availability, appointment-status, waitlist-match, retention, replies, forms-schema)
  │
  ▼
Serviços com banco (src/lib/*.ts) — sempre filtrando por actor.organizationId (src/lib/tenant.ts)
  │
  ├── audit()            → audit_logs (metadados, nunca conteúdo clínico)
  ├── clinical.ts        → cifra/decifra + clinical_access_logs (único caminho para dado clínico)
  └── notifications.ts   → fila Notification (o dispatcher envia; nunca envio síncrono)
```

Regra nova a formalizar (já é prática): **módulo = pasta em `src/lib/<modulo>/` com `rules.ts` puro + `service.ts` com banco + actions na rota**. Pacotes, comissões, documentos e portal do paciente nascem assim.

## 4. Fluxo de dados (quem escreve o quê)

| Dado | Origem | Onde vive | Quem lê |
|---|---|---|---|
| Tenant, plano, status de acesso | portal → `/api/heeca/*` | `Organization.heeca*`, `planCode`, `access` | gate de acesso, limites (nº de profissionais) |
| Usuário/sessão | SSO ou login local | `User`, `Membership`, `user_sessions` | `requireActor()` |
| Paciente (CRM) | recepção/profissional/página pública | `Patient` | conforme papel |
| Agenda | profissional/recepção/público/lista de espera | `Appointment`, `RecurringSeries`, `ScheduleBlock` | conforme papel; público só slots livres |
| Pagamento do paciente | profissional/financeiro | `Payment`, `Appointment.paymentStatus`, `PackagePurchase` | `canViewFinancials` |
| Mensagem WhatsApp | mutação da agenda → fila | `Notification` → Notify | painel `/mensagens` |
| Resposta do paciente | Notify callback | `WhatsAppWebhookEvent` → `replies.ts` → `Appointment.status` | agenda |
| Documento administrativo (termo, contrato) | profissional cria; paciente aceita por link | `Document*` (novo) | `canManageSchedule`; paciente o próprio |
| **Dado clínico** | só o profissional responsável (ou delegado) | `ClinicalNote.contentEnc`, `ClinicalDocument`, `FormRequest.answersEnc` — cifrados | `clinicalScopes()` + `ClinicalAccessLog` |

Dado clínico **nunca** entra em: `audit_logs`, `Notification.payload`, e-mail, CSV do financeiro, exportação pública, logs do servidor.

## 5. Multi-profissional e multiunidade

- **Multi-profissional já existe** (`Organization.type = CLINIC`, `Membership`, seletor `hp_pro`, convites). O briefing §30 está coberto; falta comissão (novo).
- **Multiunidade (§31, Fase 2)**: preparar sem implementar — `Unit` entra como tabela opcional ligada a `Organization`; `Professional.unitId?` e `Appointment.unitId?` nulos no MVP. Não criar telas agora.

## 6. Segmentos futuros (§40)

`Organization.segment` (`PSYCHOLOGY | THERAPY | OTHER`, default `PSYCHOLOGY`) e `Professional.registrationKind/registrationNumber` no lugar do `crp` fixo — assim Nutri (CRN) e Fono (CRFa) entram por configuração, como o `marca.ts` do motor Beauty faz. No MVP só `PSYCHOLOGY` é exibido.

## 7. Domínio público

O briefing (§17) sugere `nomedoprofissional.heecamind.com.br`. O padrão da plataforma é `mind.heeca.com.br/agendar/<slug>` (como Dental e Beauty). Subdomínio por tenant exige wildcard no Traefik com DNS-01 (só o Ticket tem, feito à mão — `infra/README.md` §4). **Recomendação**: caminho por slug no MVP; wildcard fica como opção de plano superior.
