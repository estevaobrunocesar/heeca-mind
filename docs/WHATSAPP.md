# WhatsApp — Meta Cloud API

## Como funciona

```
mutação na agenda ──► Notification (QUEUED, scheduledFor)
                                    │
        cron a cada minuto ─────────┤  src/lib/whatsapp/dispatcher.ts
                                    ▼
                          dispatchQueued()  ──► Meta Graph API ──► SENT (providerMessageId)
                                    ▲                │
    webhook (status/mensagens) ─────┘◄───────────────┘  delivered / read / failed
                                    │
                          applyReply(): "sim" → CONFIRMED · "não" → CANCELLED_BY_PATIENT
                          expirePendingBookings(): AWAITING_CONFIRMATION vencida → EXPIRED
```

- **Fila**: `Notification` com `status = QUEUED` e `scheduledFor <= now`. Claim atômico (`QUEUED → SENDING`) permite várias instâncias.
- **Retry**: falhas retryable (429/5xx) voltam a `QUEUED` com backoff 1, 2, 4, 8, 16 min; máx. 5 tentativas.
- **Lembretes/links** de sessões que deixaram de estar `CONFIRMED` não são enviados (marcados `FAILED` com o motivo).
- **Sem provedor configurado** (`WHATSAPP_ACCESS_TOKEN` vazio) o `ConsoleWhatsAppProvider` imprime a mensagem no log e marca como enviada — útil em dev.

## Variáveis de ambiente

| Var | Uso |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | id do número no WhatsApp Manager |
| `WHATSAPP_ACCESS_TOKEN` | token permanente do System User |
| `WHATSAPP_VERIFY_TOKEN` | string sua, usada no handshake do webhook |
| `WHATSAPP_APP_SECRET` | App Secret do app Meta — valida `X-Hub-Signature-256` |
| `CRON_SECRET` | `Authorization: Bearer <CRON_SECRET>` no `/api/cron` |

## Cron

Chamar `GET /api/cron` a cada minuto. No Vercel, `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron", "schedule": "* * * * *" }] }
```

Localmente: `npm run cron`.

## Webhook

URL: `https://<app>/api/webhooks/whatsapp`. Assinar os campos `messages` (traz status e mensagens recebidas). Todo evento é persistido em `whatsapp_webhook_events` (dedup por `eventId`) e processado em seguida; o cron reprocessa o que ficar com `processedAt = null`.

## Templates a cadastrar (pt_BR, categoria *Utility*)

Os nomes e a ordem das variáveis precisam bater com `src/lib/whatsapp/templates.ts`. Base dos botões de URL: `NEXT_PUBLIC_APP_URL`.

| Nome | Corpo | Botão |
|---|---|---|
| `hecca_booking_request` | Olá, {{1}}! Recebemos sua solicitação de agendamento com {{2}}.<br>Modalidade: {{3}}<br>Data: {{4}}<br>Horário: {{5}}<br>Clique abaixo para confirmar seu horário. | URL dinâmica `…/confirmar/{{1}}` |
| `hecca_booking_confirmed` | ✅ Seu atendimento foi confirmado.<br>Profissional: {{1}}<br>Modalidade: {{2}}<br>Data: {{3}}<br>Horário: {{4}}<br>Até o nosso encontro. | — |
| `hecca_reminder_24h` | Olá, {{1}}! Este é um lembrete do seu atendimento psicológico agendado para amanhã, às {{2}}.<br>Caso precise reagendar, entre em contato com antecedência. | (opcional) quick replies `Confirmar` / `Cancelar` |
| `hecca_reminder_2h` | Olá, {{1}}! Seu atendimento começa às {{2}}. Até já. | — |
| `hecca_session_link` | Olá, {{1}}! Seu atendimento online com {{2}} é hoje às {{3}}.<br>Plataforma: {{4}}<br>Acesse pelo botão abaixo. | URL dinâmica `…/sessao/{{1}}` |
| `hecca_cancellation` | Seu atendimento de {{1}} às {{2}} foi cancelado conforme solicitado. Caso queira, entre em contato para verificar novas disponibilidades. | — |
| `hecca_reschedule` | Olá, {{1}}! Seu atendimento com {{2}} foi reagendado.<br>Nova data: {{3}}<br>Novo horário: {{4}} | — |

Regra inegociável: nenhuma variável carrega conteúdo clínico. Só nome, profissional, modalidade, data, hora, plataforma e links.

## Respostas do paciente

`src/lib/whatsapp/replies.ts` interpreta texto livre ou clique em botão:

- **sim / confirmar / 1 / ok / ✅** → confirma a solicitação mais recente `AWAITING_CONFIRMATION` daquele número.
- Lista de espera: `hecca_waitlist_joined` (entrou na lista) e `hecca_waitlist_offer` (surgiu um horário; botão para `/confirmar/<token>`; {{6}} = horas de reserva). A resposta "sim" a uma oferta confirma como qualquer pedido.
- **não / cancelar / 2 / ❌** → cancela (`CANCELLED_BY_PATIENT`) se dentro do prazo `minCancelHours`; fora do prazo vira `RESCHEDULE_REQUESTED` para o profissional decidir.
- Qualquer outra coisa é ignorada (fica registrada em `whatsapp_webhook_events`).
