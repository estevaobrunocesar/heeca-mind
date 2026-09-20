# 04 — API

O Mind é um app Next.js com **Server Actions** para tudo que é autenticado (padrão do Psico: `useActionState`, `FormState`, `invalid(parsed.error, formData)`). "API" aqui = as rotas HTTP que realmente existem, porque têm chamador externo ou são públicas.

## 1. Integração com o Core (novo) — `src/lib/heeca/`

| Rota | Auth | Corpo → resposta | Regras |
|---|---|---|---|
| `POST /api/heeca/provision` | HMAC `X-Heeca-Signature` = HMAC-SHA256(`HEECA_PLATFORM_SECRET`, `${ts}.${rawBody}`), janela 5 min, comparação em tempo constante | `Entitlement` (+`owner`) → `{ tenantId, slug, appUrl }` | idempotente por `subscriptionId`; transação; audit `heeca.provision` |
| `POST /api/heeca/entitlement` | idem | `Entitlement` → `{ ok: true }` | espelha `status/plan/access/limits`; nunca cobra; audit `heeca.entitlement` |
| `GET /sso/heeca?token&next` | JWT HS256 (mesmo segredo), `aud="mind"`, `iss="heeca-portal"`, `exp` ≤ 60 s, `jti` único (tabela `RateLimit`/`used_jti` 5 min) | redirect | acha tenant por `subscriptionId`; user por e-mail (cria se não existir, sem senha); Membership por `role`; `user_sessions`; `next` só caminho relativo |
| `GET /api/health` (existe) | nenhuma | `{ ok, db, backup?, notify? }` | acrescentar ping leve ao Notify (`/api/health`) como `degraded`, sem derrubar |

Tipos (`src/lib/heeca/types.ts`) copiados do contrato: `Entitlement`, `SsoClaims`. Zod para o corpo; `rawBody` lido antes do parse para assinar.

## 2. Notify (novo) — `src/lib/whatsapp/providers/notify.ts` + `/api/webhooks/notify`

| Direção | Rota | Auth | DTO |
|---|---|---|---|
| Mind → Notify | `POST {NOTIFY_URL}/api/v1/messages` | `X-Heeca-Product: mind` + timestamp + HMAC(`NOTIFY_SECRET`) | `{ tenantId, tenantName, ref, callbackUrl, message: { kind:"template", to, name, language:"pt_BR", bodyParams: string[], body, buttons?: [{type:"url", suffix}] } }` → `202 { id, status: "QUEUED"\|"SKIPPED", reason? }` |
| Notify → Mind | `POST /api/webhooks/notify` | mesma HMAC; rejeita sem `X-Heeca-Product: mind` | `InboundEvent`: `{ type:"status", providerMessageId, status, error?, tenantId, ref }` · `{ type:"button_reply", from, buttonId, providerMessageId, tenantId, ref }` · `{ type:"text", from, text, providerMessageId, tenantId, ref }` |

Regras: `ref` = `Notification.id` (roteamento sem depender do telefone); `tenantId` do callback deve bater com `Notification.organizationId` (senão 200 + log, sem agir — um tenant não move a agenda de outro); responder 2xx rápido e processar no cron (`WhatsAppWebhookEvent` como hoje); `SKIPPED` por opt-out marca `Patient.commsPrefs.whatsapp=false` e avisa o profissional.

## 3. Rotas públicas (sem sessão) — tenant sempre por slug ou token

| Rota | Existe? | Proteções |
|---|---|---|
| `GET /agendar/[slug]`, `/[serviceId]`, `/espera` + `createPublicBookingAction` | existe | rate limit IP/telefone/profissional, honeypot, advisory lock, `select` exaustivo |
| `GET /clinica/[slug]` | existe | idem |
| `GET/POST /confirmar/[token]`, `/sessao/[token]`, `/formulario/[token]`, `/convite/[token]` | existe | token só hash no banco; uso único onde couber; rate limit por token |
| `GET/POST /documento/[token]` | novo | idem + `acceptanceHash`; expira 30 d |
| `GET/POST /pesquisa/[token]` | novo | uso único; só score+comentário |
| `POST /portal` (pedir acesso), `GET /portal/entrar/[token]`, `/portal/**` | novo | rate limit por telefone (3/h) e IP; sessão própria (`PatientSession`), **cookie separado** do Auth.js; nunca lê `ClinicalNote` |
| `GET /api/cron` | existe | `Bearer CRON_SECRET` |

Matcher do `src/proxy.ts` (rotas fora do auth): `agendar|confirmar|sessao|formulario|convite|clinica|documento|pesquisa|portal|sso|api/heeca|api/webhooks|api/health`.

## 4. Server Actions novas (autenticadas) — por módulo

| Módulo | Actions | Permissão |
|---|---|---|
| pacotes | `savePackage`, `togglePackage`, `sellPackage(patientId)`, `cancelPurchase`, `linkAppointmentToPackage`, `revertConsumption` | `canManageServices` (catálogo), `canManageSchedule` (venda/vínculo), `canViewFinancials` (valores) |
| comissões | `saveCommissionRule`, `closeCommissionPeriod`, `addCommissionAdjustment` | OWNER, FINANCE |
| documentos | `saveDocumentTemplate` (nova versão se corpo mudou), `sendDocument(patientId, templateId, appointmentId?)`, `revokeDocument`, `resendDocument` | `canEditProfessional` (modelos), `canManageSchedule` (envio) |
| tags | `saveTag`, `setPatientTags` | `canManageSchedule` |
| reativação | `listInactive(days)`, `sendReactivation(patientId)` | `canManageSchedule`; mensagem só administrativa |
| pesquisa | `toggleSurvey(professionalId)` | `canEditProfessional` |
| clínica (§6) | `saveOrganizationProfile`, `uploadLogo`, `saveDefaultPolicy` | OWNER |
| equipe | `inviteMember` (existe) + papel `FINANCE` + limite do plano | OWNER |
| portal | `revokePatientSessions(patientId)` | `canManageSchedule` |

Padrão de cada action (copiar de `src/app/(app)/pacientes/actions.ts`): `requireActor()` → zod (`src/lib/validation/<modulo>.ts`) → checagem de permissão pura → verificação de posse do registro no tenant → mutação em transação → `audit()` → `revalidatePath`.

## 5. Validação (zod, `src/lib/validation/`)

- `organization.ts`: `document` = CPF (11) ou CNPJ (14) com dígito verificador; `whatsapp` E.164 (`normalizePhone` existente); `instagram` sem `@`/URL.
- `package.ts`: `sessionsCount 1..100`, `validityDays 7..730`, `priceCents ≥ 0`, `serviceIds ⊆ serviços ativos do profissional`.
- `commission.ts`: exatamente um de `percentBp (0..10000)` / `fixedCents`; `validFrom ≤ validTo`.
- `document.ts`: `body` ≤ 50 KB, variáveis só do conjunto permitido (`extractFields` puro, testado como no Dental), `title` único por org+versão.
- `patient.ts` (existe): + `birthDate` passada, `emergencyContactPhone` E.164, `commsPrefs` shape.
- `portal.ts`: telefone E.164; edição de dados do paciente limitada a `email, phone, address*, commsPrefs` (nunca `whatsapp`, que é identidade).

Checkbox sempre via `checkbox` de `validation/common.ts` (chave ausente = false; união com `z.undefined()` falha no zod 4 — regra já documentada).

## 6. Exportações

- `GET /financeiro/export?month=` (existe, CSV `;` + BOM) — incluir pacotes e coluna "origem" (sessão/pacote).
- `GET /pacientes/[id]/export` (existe, JSON do titular) — incluir documentos aceitos (metadados + hash, sem PDF embutido) e pacotes.
- `GET /financeiro/comissoes/export?professional&period` — novo, mesmo formato.
- Nenhuma exportação inclui dado clínico (o prontuário tem a própria impressão com `ClinicalAccessLog EXPORT`).
