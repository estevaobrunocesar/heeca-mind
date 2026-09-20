# 03 — Fluxos principais

Legenda: **existe** = já funciona no Psico (arquivo citado); **novo** = a construir.

## F1. Onboarding via portal (novo) — §41.1–2

```
heeca.com.br/produtos/mind → escolhe plano → conta Heeca (portal) → assinatura TRIALING
   │
   ├─► POST mind.heeca.com.br/api/heeca/provision  (HMAC, corpo = Entitlement + owner)
   │      Mind: transação idempotente por subscriptionId:
   │        Organization { name=account.name, heecaSubscriptionId, planCode, accessState=OK, segment }
   │        User { email=owner.email, sem senha (passwordHash null) } + Membership(OWNER)
   │        Professional { displayName=owner.name, slug único, registrationKind=CRP, registrationNumber=null }
   │        ScheduleSettings + ProfessionalPolicy com defaults
   │      → { tenantId, slug, appUrl: "https://mind.heeca.com.br" }
   │
   └─► usuário clica "Abrir Heeca Mind" → GET /sso/heeca?token=<JWT 60 s>&next=/
          Mind: valida aud="mind"; acha Organization por subscriptionId; acha/cria User pelo e-mail;
          garante Membership (OWNER/ADMIN→OWNER, demais→RECEPTIONIST); cria user_sessions(sid); cookie;
          se mfaEnabled → /login/mfa (a regra do requireActor() já cobre); redirect next
          → primeira vez: /onboarding (novo): registro profissional, foto, serviços, grade — checklist com progresso
```
`/cadastro` local passa a redirecionar para `{HEECA_PORTAL_URL}/produtos/mind` quando `platformEnabled()` (padrão A10 do Nail/Beauty). Login local com senha continua para quem definir senha e para recepção convidada.

**Entitlement** (`POST /api/heeca/entitlement`): espelha `status/plan/access`; `access=blocked` → proxy manda tudo (menos rotas públicas e `/bloqueado`) para `/bloqueado` com link ao portal. Limite `planLimits.maxProfessionals` aplicado no convite de equipe (existe o ponto: `inviteAction`).

## F2. Agendamento pela página pública (existe) — §18, §19

```
/agendar/[slug]  (Professional.slug; select exaustivo)
  → serviço → modalidade → mês → dia → horário   (isSlotAvailable: grade + buffer + antecedência + bloqueios)
  → dados do paciente (+ honeypot, rate limit por IP/telefone/profissional, teto 2 pendentes por número)
  → aceite LGPD (Patient.lgpdConsentAt)
  → [novo] documentos com requireBeforeFirstSession → DocumentRequest PENDING (aceite na confirmação)
  → [novo] Service.requiresDeposit → Appointment.depositCents; mensagem heeca_sinal com chave Pix   ⚑ D5
  → transação com pg_advisory_xact_lock(hashtext(professionalId)) → Appointment PENDING/AWAITING_CONFIRMATION
  → Notification BOOKING_REQUEST (fila) → Notify → template heeca_confirmacao com botão /a/<token>
  → paciente confirma em /confirmar/[token] (ou responde "sim") → CONFIRMED → heeca_confirmado
  → sem resposta em X h → expirePendingBookings → EXPIRED (cron)
```
Sem horário → `/agendar/[slug]/espera` → `WaitlistEntry` (existe, §22).

**⚑ DECISÃO D5 — sinal/pagamento antecipado no MVP**: (a) *manual*: mensagem com chave Pix do profissional + "enviar comprovante"; profissional marca `depositPaidAt`; (b) *gateway* (Asaas cobrança avulsa do paciente, webhook). O portal usa Asaas só para cobrar o *profissional*. Recomendo (a) no MVP; (b) entra com "pagamento recorrente" da Fase 2.

## F3. Sessões recorrentes (existe) — §10

`RecurringSeries { frequency WEEKLY|BIWEEKLY, weekday, startTime, modality, startsOn, endsOn? }` → o cron materializa as próximas N semanas de `Appointment` (`seriesId`). Ações: pausar (`isActive=false` + cancela futuras), encerrar (`endsOn`), alterar horário/profissional (encerra a série e abre outra a partir da data — histórico preservado), cancelar/reagendar **uma** sessão (só o `Appointment`). Cancelar série = só futuras ativas, passadas intactas.
Gap pequeno: **`MONTHLY`** ("a cada 4 semanas") e "a cada 15 dias" a partir de data arbitrária — `BIWEEKLY` já cobre o segundo.

## F4. Atendimento online (existe) — §11

`Professional.onlinePlatform` + `onlineFixedLink` **ou** `Appointment.onlineLink` por sessão. Template `SESSION_LINK` (→ `heeca_mind_sessao_online`, botão `/p/<token>` → `/sessao/[token]` mostra o link no horário). Integração de videoconferência = Fase 3; a arquitetura já isola em `OnlinePlatform`.

## F5. Dia do profissional — §38 ("abrir → olhar a agenda → atender → registrar → seguir")

```
/  dashboard: hoje (sessões, próxima, pendentes, online/presencial), financeiro do mês, comparecimento
/agenda  dia|semana|mês|profissional → clique → detalhe da sessão
   ações por availableActions(status): confirmar · iniciar · concluir · faltou · cancelar · reagendar
   concluir → transition(COMPLETED):
       existe: completedAt, syncWaitlist, notifyProfessional
       novo:   consumir PackageConsumption se packagePurchaseId (D2) · gerar CommissionEntry se basis=COMPLETED ·
               agendar ExperienceSurvey (+24 h, heeca_mind_pesquisa) · Patient.lastCompletedAt
   pagamento: registrar (parcial/integral/isento) → Payment → CommissionEntry se basis=RECEIVED
   [clínico, só quem canWriteFor] "Registrar evolução" → ClinicalNote (fora do fluxo administrativo)
```

## F6. WhatsApp via Notify (novo provider, fila existente) — §16

```
mutação da agenda → notifications.ts enfileira Notification(QUEUED, templateName, payload sem dado clínico)
cron 1 min → dispatcher: claim QUEUED→SENDING → NotifyWhatsAppProvider.send():
    POST {NOTIFY_URL}/api/v1/messages
      headers X-Heeca-Product: mind · X-Heeca-Timestamp · X-Heeca-Signature (HMAC do corpo)
      body { tenantId: organizationId, tenantName, ref: notification.id,
             callbackUrl: https://mind.heeca.com.br/api/webhooks/notify,
             message: { kind: "template", to, name, language: "pt_BR", bodyParams, body, buttons } }
    202 { id, status } → providerMessageId=id, SENT | SKIPPED(opt-out/cota) → marca e não tenta de novo
Notify → POST /api/webhooks/notify (assinado): { type: status|button_reply|text, tenantId, ref, ... }
    → grava WhatsAppWebhookEvent (dedupe por providerMessageId) → replies.ts (puro, existe) → transition()
```
O webhook da Meta atual (`/api/webhooks/whatsapp`) e as 4 variáveis `WHATSAPP_*` **saem**. `ConsoleWhatsAppProvider` fica para dev.

Mapeamento de templates:

| `NotificationType` (Psico) | Template | Origem |
|---|---|---|
| BOOKING_REQUEST | `heeca_confirmacao` | unificado |
| BOOKING_CONFIRMED | `heeca_confirmado` | unificado |
| REMINDER_24H | `heeca_lembrete` | unificado |
| CANCELLATION | `heeca_cancelado` | unificado |
| RESCHEDULE | `heeca_remarcado` | unificado |
| (sinal) | `heeca_sinal` | unificado |
| REMINDER_2H, SESSION_LINK, WAITLIST_JOINED, WAITLIST_OFFER, FORM_REQUEST, DOCUMENT_REQUEST*, PAYMENT_PENDING*, SURVEY*, REACTIVATION*, PORTAL_LOGIN* | `heeca_mind_*` | específicos (plataforma cadastra na Meta — D10) |

`*` novos. Todos administrativos; texto configurável pelo profissional só nas partes marcadas como variável (a Meta aprova o template fixo). Reativação e pesquisa só saem por clique humano ou opt-in explícito do profissional (§28/§29).

## F7. Documentos e consentimentos (novo) — §15

```
Configurações → Documentos: DocumentTemplate (título, corpo com variáveis, tipo, exigir antes da 1ª sessão)
Ficha do paciente / sessão → "Enviar documento" → DocumentRequest { bodySnapshot, tokenHash, expiresAt 30 d }
   → heeca_mind_documento com botão /p/<token> → /documento/[token] (público, sem sessão):
        VIEWED (viewedAt) → lê → digita nome → "Li e aceito" → ACCEPTED { acceptedAt, ip, ua, acceptanceHash }
        → PDF gerado (corpo + rodapé com hash, nome, data/hora, IP) → R2 → pdfKey
   → notifyProfessional(PRO_DOCUMENT_ACCEPTED) · audit("document.accept")
Portal do paciente lista os aceitos e permite baixar o PDF.
```
Cada instância registra data, hora, versão, quem enviou e status — exatamente a lista do §15. Reenviar = token novo, anterior invalidado (padrão do `FormRequest`).

## F8. Pacotes (novo) — §20

```
/pacotes (catálogo) → vender na ficha do paciente → PackagePurchase ACTIVE (expiresAt = hoje + validityDays)
   pagamento: Payment(packagePurchaseId) → paymentStatus
agendar sessão do paciente → se há PackagePurchase ACTIVE compatível (serviço/profissional) → sugere vincular
concluir sessão → PackageConsumption → saldo = total − consumos válidos; 0 → EXHAUSTED
cron diário → expiresAt < hoje → EXPIRED (sessões já agendadas continuam; não consomem)
ficha e portal mostram "5 contratadas · 2 usadas · 3 disponíveis · vence em 12/12"
```

## F9. Portal do paciente (novo) — §17

```
/portal → informa WhatsApp → PatientAccessToken (rate limit por telefone) → heeca_mind_acesso_portal com /p/<token>
/portal/entrar/[token] → PatientSession(sid) cookie 30 d
/portal: próximas sessões (link online no horário) · reagendar/cancelar dentro da política · pagamentos e pacotes ·
         documentos (pendentes → aceitar; aceitos → PDF) · meus dados (edição limitada) · sair
```
Nada clínico no portal. Reagendar reaproveita `isSlotAvailable`; cancelar respeita `ProfessionalPolicy.cancellationHours` (e a regra do sinal, §23).

## F10. Comissões (novo) — §25

Evento base (pagamento ou conclusão, D3) → `CommissionEntry` pela `CommissionRule` vigente (serviço específico > geral). `/financeiro/comissoes` (OWNER, FINANCE): por profissional e período, "Fechar período" → `CommissionClosing` imutável; lançamentos depois do fechamento entram no próximo. Profissional vê só as próprias.

## F11. LGPD e retenção (existe) — §14

Exclusão lógica → `retentionYears` (mín. 5, CFP) → anonimização irreversível no cron; exportação do titular em JSON. **Estender** `anonymize.ts` para: `emergencyContact*`, `DocumentRequest.acceptName/ip/ua` (manter hash e PDF? ⚑ D6: PDF de termo assinado é prova contratual — recomendo manter o PDF e o hash, anonimizar nome/IP na linha), `ExperienceSurvey.comment`, `ReactivationContact`, `PatientSession/AccessToken` (apagar).
