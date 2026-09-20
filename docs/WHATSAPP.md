# WhatsApp — via Heeca Notify

O Mind **não fala com a Meta**. Toda mensagem ao paciente sai pelo Heeca Notify (`notify.heeca.com.br`, contrato em `heeca_notify/README.md`), que tem a WABA, a fila de entrega, o opt-out global ("PARAR") e a cota mensal por estabelecimento. Aqui fica só a decisão do que enviar, quando, e o que fazer com a resposta.

## Como funciona

```
mutação na agenda ──► Notification (QUEUED, scheduledFor, templateName, payload)
                                    │
        cron a cada minuto ─────────┤  src/lib/whatsapp/dispatcher.ts
                                    ▼
                          dispatchQueued() ──► POST notify/api/v1/messages (HMAC NOTIFY_SECRET) ──► 202 { id } → SENT
                                    ▲                                    │  ou { status: SKIPPED } → FAILED (opt-out/cota)
   /api/webhooks/notify ────────────┘◄───────── callback assinado ───────┘  status: delivered / read / failed
   (inbound.ts → whatsapp_webhook_events)                                   button_reply: confirm|reschedule|cancel:<token>
                                    │                                       text: "sim" / "não"
                          applyReply(): botão com token → sessão exata · texto → última pendente do número
                          expirePendingBookings(): AWAITING_CONFIRMATION vencida → EXPIRED
```

- **Fila**: `Notification` com `status = QUEUED` e `scheduledFor <= now`. Claim atômico (`QUEUED → SENDING`) permite várias instâncias.
- **Retry**: falhas retryable (rede, 429, 5xx do Notify) voltam a `QUEUED` com backoff 1, 2, 4, 8, 16 min; máx. 5 tentativas. 400/401/422 (segredo, template, parâmetros) são erro nosso: `FAILED` na hora.
- **Lembretes/links** de sessões que deixaram de estar `CONFIRMED` não são enviados (marcados `FAILED` com o motivo).
- **`WHATSAPP_PROVIDER=console`**: `ConsoleWhatsAppProvider` imprime a mensagem no log e marca como enviada — útil em dev; nada chega ao paciente.

## Variáveis de ambiente

| Variável | Valor |
|---|---|
| `WHATSAPP_PROVIDER` | `notify` em produção; `console` em dev |
| `NOTIFY_URL` | `https://notify.heeca.com.br` |
| `NOTIFY_SECRET` | o mesmo que `NOTIFY_SECRET_MIND` no Notify (≥ 16 caracteres; a plataforma gera) |
| `NOTIFY_PRODUCT` | `mind` (cabeçalho `X-Heeca-Product`) |
| `NEXT_PUBLIC_APP_URL` | base dos botões de URL dos templates específicos e do `callbackUrl` |

## Cron

Chamar `GET /api/cron` com `Authorization: Bearer <CRON_SECRET>` a cada minuto (Coolify Scheduled Task; na Vercel, `vercel.json`). Localmente: `npm run cron`.

## Callback (Notify → Mind)

`POST /api/webhooks/notify`, assinado com `NOTIFY_SECRET` (`X-Heeca-Product: mind`, `X-Heeca-Timestamp`, `X-Heeca-Signature`), corpo = `InboundEvent` do Notify com `tenantId` (= `Organization.id`) e `ref` (= `Notification.id`) da mensagem de origem. `src/lib/whatsapp/inbound.ts` traduz para o evento bruto de `whatsapp_webhook_events` (dedup por `eventId`), o processamento roda em seguida e o cron reprocessa o que ficar com `processedAt = null`. `tenantId`/`ref` divergentes da `Notification` → evento ignorado.

Simular sem o Notify: `npm run heeca:sim -- notify status|button|text …` (ver cabeçalho de `scripts/heeca-sim.ts`).

## Templates

Fonte da verdade: `src/lib/whatsapp/templates.ts`. Dois grupos:

**Unificados da plataforma** (cadastrados uma vez pela Heeca; nome, nº de parâmetros e botões precisam bater com `heeca_notify/src/lib/templates.ts` — `tests/notify.test.ts` espelha isso):

| `NotificationType` | Template | Parâmetros | Botões |
|---|---|---|---|
| BOOKING_REQUEST | `heeca_confirmacao` | cliente, estabelecimento, serviço, profissional, data, hora | Confirmar · Remarcar · Cancelar (quick_reply) |
| BOOKING_CONFIRMED | `heeca_confirmado` | estabelecimento, serviço, profissional, data, hora, orientações | — |
| REMINDER_24H | `heeca_lembrete` | cliente, estabelecimento, serviço, "amanhã", hora | Remarcar · Cancelar |
| CANCELLATION | `heeca_cancelado` | estabelecimento, serviço, data, hora | Agendar novamente (URL → `heeca.com.br/a/mind/<slug>`) |
| RESCHEDULE | `heeca_remarcado` | estabelecimento, serviço, data, hora | — |

"Estabelecimento" = nome da clínica, ou o nome profissional quando é autônomo. "Serviço" leva a modalidade ("Sessão individual (online)") a menos que o nome já a traga. "Orientações" = `Service.patientInstructions` (administrativas), ou `" "` — a Meta não aceita parâmetro vazio.

**Específicos do Mind** (`heeca_mind_*`; a plataforma cadastra na WABA com base de URL = `NEXT_PUBLIC_APP_URL`):

| `NotificationType` | Template | Botão |
|---|---|---|
| REMINDER_2H | `heeca_mind_lembrete_2h` | — |
| SESSION_LINK | `heeca_mind_sessao_online` | URL `/confirmar/<token>` (mostra o link da sala no horário) |
| WAITLIST_JOINED | `heeca_mind_lista_espera` | — |
| WAITLIST_OFFER | `heeca_mind_oferta_horario` | URL `/confirmar/<token>` |
| FORM_REQUEST | `heeca_mind_formulario` | URL `/formulario/<token>` |
| DOCUMENT_REQUEST | `heeca_mind_documento` | URL `/documento/<token>` |
| PORTAL_LOGIN | `heeca_mind_acesso_portal` | URL `/portal/entrar/<token>` (15 min, uso único) |

Textos de referência de todos estão no `reference` de cada entrada em `templates.ts`. Mudar texto de template aprovado = novo nome.

**Regra**: nenhuma variável carrega conteúdo clínico. Só nome, estabelecimento, serviço, profissional, modalidade, data, hora, orientações administrativas e links.

## Respostas do paciente

`src/lib/whatsapp/replies.ts` interpreta o clique num botão ou texto livre:

- **Botão com token** (`confirm|reschedule|cancel:<confirmationToken>`): age na sessão exata daquele token, desde que o telefone seja o do paciente dela. `confirm` só em `AWAITING_CONFIRMATION`; `reschedule` vira `RESCHEDULE_REQUESTED` sempre (nunca cancela); `cancel` cancela dentro do prazo `minCancelHours`, fora dele vira `RESCHEDULE_REQUESTED`.
- **Texto livre**: **sim / confirmar / 1 / ok / ✅** → confirma a solicitação mais recente `AWAITING_CONFIRMATION` daquele número; **não / cancelar / 2 / ❌** → cancela (ou pedido de reagendamento, fora do prazo). "Sim" a uma oferta da lista de espera confirma como qualquer pedido.
- Qualquer outra coisa é ignorada (fica registrada em `whatsapp_webhook_events`).
- **Opt-out** ("PARAR") é tratado pelo Notify: o envio seguinte volta `SKIPPED` e a notificação fica `FAILED` com o motivo.
