# Heeca Mind

Vertical de saúde mental da plataforma Heeca (antes "Hecca Psico"; o produto foi rebatizado em 20/09/2026 e está sendo integrado ao Core — portal, Notify, R2). Spec original em `docs/SPEC.md`; arquitetura, ERD, fluxos, plano e decisões do Mind em `docs/mind/` (comece pelo `docs/mind/README.md`; decisões D1–D9 fechadas em 20/09 conforme as recomendações do `06-GAPS-E-PLANO.md`).

## Stack

- Next.js 16 (App Router, Server Actions, `proxy.ts` no lugar de `middleware.ts`), React 19, TypeScript, Tailwind 4
- Prisma 7 (`prisma-client` generator → `src/generated/prisma`, driver adapter `@prisma/adapter-pg`), PostgreSQL 16
- Auth.js v5 (`next-auth@beta`) com Credentials + JWT
- WhatsApp: Meta Cloud API (`src/lib/whatsapp/`)

## Comandos

```bash
docker compose up -d          # Postgres local na porta 5433
npm run db:migrate            # prisma migrate dev
npm run db:seed               # ana@exemplo.com / senha12345 → /agendar/dra-ana-lucia
npm run dev                   # após mudar o schema: prisma generate + reiniciar (o processo guarda o client antigo)
# NUNCA rode `npm run build` ou `next typegen` com o dev server ligado: corrompe .next/dev e rotas passam a dar 404.
# Se acontecer: parar o dev, `rm -rf .next`, subir de novo.
npm run cron                  # roda dispatcher/expiração/webhook uma vez (dev)
npm run heeca:sim -- provision ana@exemplo.com          # simula o portal (provision/entitlement/sso) e o Notify (callbacks)
npm run check:tenant          # isolamento por tenant dos módulos do Mind (banco local)
npm run check:lgpd            # anonimização (banco local)
npm test
npm run build                 # build de produção (NODE_ENV=production)
npm run docker:build          # imagem Docker
npm run typecheck
```

## Convenções que não se derivam do código

- **Tenant sempre explícito.** Toda query em entidade com `organizationId` filtra por `actor.organizationId`. Use os helpers de `src/lib/tenant.ts`. Nunca confie em id vindo do cliente sem verificar o tenant.
- **Ator via `requireActor()`** (`src/lib/session.ts`) em Server Components/Actions. Autorização em `src/lib/permissions.ts` — funções puras, sem banco. `actor.professionalId` = "quem eu sou"; `actor.activeProfessionalId` = "de quem estou cuidando" (seletor do cabeçalho para dono/recepção). Telas usam o ativo; permissões comparam com o próprio.
- **Administrativo ≠ clínico.** `Patient.adminNotes` e `Appointment.adminNote` são operacionais. Conteúdo terapêutico só em `ClinicalNote.contentEnc`, cifrado por `src/lib/crypto.ts`, acesso via `canAccessClinicalData` + `ClinicalAccessLog`.
- **WhatsApp só por template.** `src/lib/whatsapp/templates.ts` é a lista fechada de variáveis. Nenhum campo livre do banco entra numa mensagem.
- **Página pública usa `select` exaustivo** (`src/app/agendar/[slug]/page.tsx`). Nunca `include` ou objeto inteiro em rota sem auth.
- **Dinheiro em centavos (Int). Datas em UTC. Grade semanal em `"HH:mm"` no fuso da organização.**
- **Mutações relevantes registram `audit()`** (`src/lib/audit.ts`) com `action` no formato `entidade.verbo`.
- Textos de UI em pt-BR. Identificadores de código em inglês.

## Estrutura

```
src/app/(auth)/        login, cadastro, recuperar-senha, redefinir-senha
src/app/(app)/         painel autenticado (dashboard, agenda, pacientes, serviços, financeiro, configurações)
src/app/agendar/[slug] página pública (sem auth)
src/app/api/webhooks/  webhook WhatsApp
src/lib/               db, session, permissions, tenant, audit, crypto, whatsapp/, validation/
prisma/                schema, migrations, seed
```

## Estado dos módulos

| Módulo | Estado |
|---|---|
| 1 Autenticação | ✅ cadastro, login, recuperação de senha |
| 2 Configuração do consultório | ✅ perfil, grade semanal, regras, bloqueios/exceções, políticas |
| 3 Serviços | ✅ CRUD, ordenação, ativar/desativar, exclusão protegida |
| 4 Agenda | ✅ dia/semana/mês, criação manual + recorrência, transições de status, reagendar, cancelar série |
| 5 Pacientes | ✅ listagem com busca/filtros/etiquetas, ficha administrativa completa (§12), criar/editar, exclusão lógica LGPD + restauração |
| 6 Agendamento público | ✅ modalidade → mês → dia → horário → dados + LGPD; confirmação/cancelamento por token |
| 7 WhatsApp | ✅ dispatcher com retry, webhook (status + respostas), expiração de pendentes, link de sessão, painel /mensagens — falta só credenciais reais da Meta |
| 8 Dashboard | ✅ sessões do dia, próxima, pacientes ativos, confirmadas, pendentes, cancelamentos, reagendamentos, online/presencial, faturamento, comparecimento |
| 9 Financeiro | ✅ pagamento (parcial/integral/isento/desfazer) na sessão, /financeiro por mês com realizado/recebido/a receber/previsto (+ pacotes vendidos), marcar pago em 1 clique, CSV com origem |
| 10 Pacotes | ✅ catálogo, venda na ficha, vínculo/auto-vínculo, consumo em concluída/falta (política), reversão, expiração |
| 11 Documentos | ✅ modelos versionados com variáveis, envio por WhatsApp, aceite com hash, registro imprimível, envio automático na 1ª sessão |
| 12 Portal do paciente | ✅ link mágico, sessões, reagendar/cancelar pela política, pagamentos, pacotes, documentos, dados próprios |
| 13 Comissões | ✅ regras por profissional/serviço, lançamento por pagamento recebido, fechamento imutável, estorno, ajuste, CSV |
| 14 Relatórios e retenção | ✅ /relatorios (§27) com definições explícitas, cards §26 no dashboard, reativação por clique, pesquisa de experiência |

## Segmento e registro profissional (Mind, etapa 0)

- `Organization.segment` (`PSYCHOLOGY` | `THERAPY`, default PSYCHOLOGY) decide o tipo de registro padrão. O MVP só exibe Psicologia; não criar telas de segmento agora.
- `Professional.registrationKind` (`CRP` | `CRN` | `CRFa` | `NONE`) + `registrationNumber` (nulo = perfil provisionado pelo portal e ainda não preenchido) substituem o antigo `crp`. Regras puras em `src/lib/registration.ts` (testado); formulários usam `registrationField(kind)` de `src/lib/validation/registration.ts`. **Nunca** formatar "CRP …" à mão: telas chamam `formatRegistration(p)` (respeita `showRegistration`) e documentos oficiais `formatRegistration(p, { force: true })`.
- Convite de equipe herda o tipo de registro do segmento da organização (`DEFAULT_REGISTRATION_BY_SEGMENT`).

## CRM e clínica (Mind, etapa 2)

- Papéis: OWNER, PROFESSIONAL, RECEPTIONIST, **FINANCE** (valores de todos, agenda e pacientes só leitura, nunca clínico). Criar/editar paciente exige `canManagePatients`; recepção continua podendo.
- Ficha do paciente (§12): `phone`, `birthDate` (`@db.Date`, ler/gravar em UTC), endereço, contato de emergência, `commsPrefs` (`src/lib/comms-prefs.ts`, puro; null = tudo ligado; só afeta lembretes — `scheduleReminder` respeita), `lastCompletedAt` (gravado em `completeAppointmentAction`; base da reativação) e **tags** (`Tag` por organização, upsert por nome em `syncPatientTags`; `/pacientes?tag=`). Tudo administrativo: entra na exportação do titular e na anonimização.
- Cadastro da clínica (§6) em `/configuracoes/clinica` (só OWNER): `organizationSchema`; CPF/CNPJ validado por dígito verificador em `src/lib/br-document.ts` (puro), guardado só dígitos. O bloco nome/slug saiu da aba Equipe.
- `AppointmentStatus.IN_PROGRESS` ("Em atendimento"): ação `start`; em atendimento só conclui.
- **Fronteira cliente/servidor**: `src/lib/validation/*`, `comms-prefs`, `registration`, `br-document` são importados por componentes cliente — nunca importar `@/generated/prisma/client` (runtime) neles; `Prisma.JsonNull` fica nas actions. O `tsc` não pega isso; só o `next build`/Turbopack.

## Pacotes de sessões (Mind, etapa 3 — §20, decisões D1/D2)

- `src/lib/packages/rules.ts` é puro e testado: **saldo = total − consumos não revertidos, sempre calculado**; `effectiveStatus` (CANCELLED > EXHAUSTED > EXPIRED > ACTIVE); `covers` (mesmo profissional; `serviceIds` vazio = qualquer); `consumeReasonFor` (COMPLETED sempre; NO_SHOW se `ProfessionalPolicy.noShowConsumesPackage`); `expiresAtFor` = fim do dia civil no fuso da organização. `service.ts` liga ao banco.
- `Package` (catálogo, por profissional como os serviços) → `PackagePurchase` (venda; **snapshot** de nome, sessões, preço e cobertura) → `PackageConsumption` (uma por sessão, `appointmentId` único; reverter marca `revertedAt`, não apaga).
- Sessão coberta: `Appointment.packagePurchaseId` + `paymentStatus = PACKAGE` — **não entra em realizado nem em a receber**; a receita é a venda (`Payment.packagePurchaseId`). `Payment` é polimórfico com check constraint: exatamente um de `appointmentId`/`packagePurchaseId`. Financeiro e CSV tratam PACKAGE e listam as vendas do mês.
- Fluxo: vincular (ficha/sessão, ou `autoLinkPackage` na criação quando há **um único** pacote ativo que cobre) → consumir em `transition()` via `consumeIfDue` (idempotente) → reverter com motivo. Cancelar a compra devolve as sessões futuras vinculadas a PENDING. Cron: `expirePurchases`.
- Cliente: `PackagesPanel` (ficha), `PackageSection` (sessão), `/pacotes` (catálogo). Formulários que fecham ao salvar usam `useEffect` em `state.ok`, nunca chamada no render.

## Documentos administrativos e consentimentos (Mind, etapa 4 — §15, D6)

- `src/lib/documents/rules.ts` (puro, testado): variáveis permitidas (`DOCUMENT_VARIABLES` — nada clínico), `renderDocument` com `missing`, `bodyHash` (texto canônico), `acceptanceHash` = sha256(bodyHash|nome normalizado|instante ISO|IP), `nameMatches` (completo ou primeiro+último, sem acento/caixa), `isNewVersion`, modelos iniciais.
- `DocumentTemplate` (por profissional; salvar com título/texto diferente **incrementa `version`**) → `DocumentRequest` (snapshot **renderizado** + hash; token só-hash; um em aberto por modelo+paciente; reenviar troca token e snapshot). Mesmo desenho dos formulários; TTL 30 dias; cron expira e faz o envio automático dos "exigir antes da 1ª sessão".
- Aceite em `/documento/[token]` (rota pública no proxy): nome precisa conferir com o cadastro; grava nome, IP, UA, hash; e-mail `PRO_DOCUMENT_ACCEPTED` ao profissional; WhatsApp `heeca_mind_documento`. Aceito não se cancela — envia-se nova versão. "PDF" = página de impressão (`PrintButton`), como o prontuário.
- Anonimização (D6): mantém texto e hashes, zera nome/IP/UA; pendentes viram REVOKED. Registro interno em `/pacientes/[id]/documentos/[requestId]` (auditado como `document.view_record`).
- Os `FormTemplate` com `dataClass=ADMINISTRATIVE` continuam válidos como questionários; termos novos devem nascer como documentos.

## Portal do paciente (Mind, etapa 5 — §17, D4)

- `/portal/[slug]` (slug do profissional dá o tenant). Entrada por **link mágico no WhatsApp** (`PatientAccessToken`, 15 min, uso único, template `heeca_mind_acesso_portal`); resposta sempre neutra (não revela se o número existe); rate limit `portal:phone` 3/h e `portal:ip`. `/portal/entrar/[token]` troca por `PatientSession` + cookie `hm_patient` (HttpOnly, path `/portal`, 30 dias) — **nunca** sessão do Auth.js; o paciente não é User.
- `src/lib/portal/service.ts`: `getPortalActor(organizationId)` (sessão válida e da organização do slug), home (sessões, pagamentos em aberto, pacotes, documentos), `patientCanChange` (status ativo + prazo `minCancelHours`/`minRescheduleHours`), cancelar/reagendar (mesma disponibilidade da página pública com `excludeAppointmentId`; `isSlotAvailable` reconferido no servidor), abrir documento pendente (gira o token), dados próprios (nunca nome/WhatsApp), `revokePatientSessions`, `purgePortal` no cron.
- Nada clínico é lido no portal — nem por engano: as queries selecionam só campos administrativos. Ações do paciente auditam com `actor = null` e `after.by = "portal"`.
- Sessões criadas manualmente não têm `confirmationToken`; `enqueueAppointmentNotification` cria um quando o template exige botão (os unificados `heeca_lembrete`/`heeca_confirmacao` exigem).

## Comissões (Mind, etapa 6 — §25, D3)

- Base = **valor recebido** (`Payment`, sessão ou pacote). Gancho único: `onPaymentRecorded(paymentId)` depois de criar o pagamento e `onPaymentsReverted(ids)` **antes** de apagar; ambos idempotentes e nunca lançam (comissão não pode impedir um recebimento).
- `src/lib/commissions/rules.ts` (puro, testado): `pickRule` (serviço > geral; mais recente vence; validade inclusiva), `computeAmount` (basis points, arredonda para baixo), `packagePaymentAmount` (percentual sobre o pago; fixo proporcional às sessões pagas), `openTotal`, `validateRule`.
- `CommissionEntry` nunca é editado. Fechamento (`closePeriod`) é imutável: estorno de pagamento já fechado vira lançamento **REVERSAL negativo** em aberto; ajuste manual é ADJUSTMENT. Regras não se apagam — encerram a vigência (`validTo`).
- Permissões: `canViewCommissions` (OWNER/FINANCE todos; PROFESSIONAL só o próprio), `canManageCommissions` (OWNER/FINANCE). Telas: `/financeiro/comissoes` (+ CSV auditado), `/configuracoes/comissoes`.

## Dashboard, relatórios, reativação e pesquisa (Mind, etapa 7 — §26–§29)

- `src/lib/reports/rules.ts` (puro, testado) define cada indicador e a UI mostra "como é calculado": ocupação = minutos ocupados ÷ minutos de grade (`workingMinutes`, capacidade nominal sem bloqueios); ticket médio = recebido ÷ concluídas cobradas; clientes novo/ativo/recorrente/inativo e retenção (`clientCohorts`); `surveySummary`; `reactivationCandidates`. `/relatorios` (OWNER/FINANCE: clínica toda ou por profissional; PROFESSIONAL: o próprio; valores só com `canViewFinancials`). Dashboard ganhou novos/inativos/ocupação 7 dias/lista de espera.
- **Pesquisa de experiência** (`ExperienceSurvey`): liga em Políticas (`surveyEnabled`); `scheduleSurveyForAppointment` no `completeAppointmentAction` cria a pesquisa e enfileira `heeca_mind_pesquisa` para +24 h; `/pesquisa/[token]` (pública, uso único, 0–10 + comentário). Administrativa e privada — texto na UI diz explicitamente que não é sobre o acompanhamento. Anonimização zera o comentário e mantém a nota.
- **Reativação** (`/pacientes/reativacao`): lista = `reactivationCandidates` com `ProfessionalPolicy.reactivationAfterDays`; **nada automático** — cada convite é um clique que enfileira o unificado `heeca_retorno` (frase configurável `reactivationInviteText`, botão Agendar → `/a/mind/<slug>`) e grava `ReactivationContact` (não repete antes de N dias).

## Padrões de formulário

- Server Actions com `useActionState`; estado tipado como `FormState` (`src/lib/form.ts`).
- Em falha de validação, a action retorna `invalid(parsed.error, formData)` — devolve erros por campo **e** os valores digitados (exceto senhas/tokens), porque o React 19 reseta o `<form>` após a action. O componente usa `state.values?.campo ?? valorOriginal` como `defaultValue`.
- `<Select>` remonta via `key={defaultValue}` — o React ignora mudanças de `defaultValue` em `<select>` depois do mount.
- Ações de edição recebem o id via `action.bind(null, id)`, nunca por hidden input; o servidor sempre re-verifica a posse do registro.

## Fuso horário

- `src/lib/time.ts` é o único lugar de conversão. `dateTimeInTz("2026-09-22","15:00",tz)` -> UTC; `toLocalFields(date,tz)` -> campos de parede. Nunca `new Date("YYYY-MM-DDTHH:mm")` sem fuso.
- `ScheduleException.date` e `RecurringSeries.startsOn/endsOn` são `@db.Date`: guardar `new Date("YYYY-MM-DDT00:00:00Z")` e ler com `getUTC*` — data civil, sem fuso.
- Bloqueio "dia inteiro" = 00:00–23:59 no fuso da organização.

## Disponibilidade e agendamento

- `src/lib/availability.ts` é puro e testado (`npm test`). `src/lib/availability-data.ts` carrega o input do banco. Nunca calcular slots direto com Prisma.
- Bloqueios não recortam janelas: são tratados como "ocupado" para manter os candidatos alinhados ao passo (09:00, 09:30…).
- Agendamento manual (`/agenda/novo`) ignora a grade e o buffer, mas respeita conflitos duros (sessão ativa, bloqueio). Página pública usará `isSlotAvailable` (grade + buffer + antecedência).
- Transições de status só via `src/lib/appointment-status.ts`; a UI mostra botões por `availableActions(status)` e o servidor re-valida com `canTransition`.
- Mutações de agenda enfileiram `Notification` (QUEUED) via `src/lib/notifications.ts`; o envio real é o dispatcher do módulo 7.
- Cancelar "série" cancela só as sessões futuras ainda ativas e encerra a `RecurringSeries`; passadas ficam intactas.
- Checkbox em zod: use `checkbox` de `src/lib/validation/common.ts` (chave ausente = false). Union com `z.undefined()` falha em zod 4.

## Fluxo público

- `/agendar/[slug]/[serviceId]` é 100% server-rendered; cada passo é um link com searchParams (`modality`, `month`, `date`, `time`). Sem estado no cliente até o formulário final.
- `createPublicBookingAction` re-valida o slot no servidor dentro de uma transação com `pg_advisory_xact_lock(hashtext(professionalId))` — evita dupla reserva simultânea.
- A página "solicitado" NÃO exibe o token; confirmar só pelo link do WhatsApp (`/confirmar/[token]`) comprova a posse do número.
- Paciente é reaproveitado por (organizationId, whatsapp); nome existente não é sobrescrito por formulário anônimo.
- Rotas públicas (`agendar`, `confirmar`, `sessao`) ficam fora do matcher do proxy — ver `src/proxy.ts`.
- Rate limit em `src/lib/rate-limit.ts` (janela fixa no Postgres, chaves sha256): público por IP/telefone/profissional + teto de 2 pendentes por número; ações por token; login por IP e e-mail; reset por IP. Sem header de proxy, anônimos caem no balde "unknown". Limpeza no cron.

## Plataforma Heeca — portal e Notify (Mind, etapa 1)

- `src/lib/heeca/core.ts` é puro (HMAC, JWT HS256 do SSO, mapeamentos) e testado; `service.ts` liga ao banco: `provision` (idempotente por `heecaSubscriptionId`), `applyEntitlement` (espelha `accessState/planCode/planLimits`), `resolveSsoUser` (jti de uso único via `RateLimit`). Rotas: `/api/heeca/provision|entitlement` (HMAC) e `/sso/heeca` (JWT → provider `heeca-sso` do Auth.js → mesma `user_sessions`, mesmo MFA).
- **O portal é dono de plano e cobrança.** Nada aqui cobra o profissional; telas de assinatura apontam para `portalAccountUrl()`. `accessState=BLOCKED` → o layout do app manda para `/bloqueado`; `WARNING` → `AccessBanner`. Com `HEECA_PLATFORM_SECRET` definido, `/cadastro` redireciona para o portal e a action recusa.
- Usuário criado por SSO nasce com senha inutilizável; "esqueci a senha" cria uma local. Papel do portal OWNER/ADMIN → OWNER; demais → RECEPTIONIST (BILLING → FINANCE quando existir).
- Simulador: `npm run heeca:sim` (provision, entitlement, sso, notify) — ver docs/DEPLOY.md §5.

## WhatsApp (ver docs/WHATSAPP.md)

- **Envio só pelo Heeca Notify** (`WHATSAPP_PROVIDER=notify`, `src/lib/whatsapp/notify.ts`): nenhum token da Meta neste app. Callback assinado em `/api/webhooks/notify` → `inbound.ts` traduz para o evento bruto que o dispatcher já processava; `tenantId`/`ref` do callback são conferidos contra a `Notification`.
- `templates.ts`: unificados da plataforma (`heeca_confirmacao|confirmado|lembrete|cancelado|remarcado`) precisam bater em nº de parâmetros e tipos de botão com `heeca_notify/src/lib/templates.ts` (teste `tests/notify.test.ts` espelha); específicos são `heeca_mind_*`. Botões quick_reply levam `<intenção>:<confirmationToken>`; `applyReply` resolve pelo token (e confere o telefone) antes de cair no texto livre por número. "Remarcar" nunca cancela.
- `src/lib/whatsapp/dispatcher.ts`: `runCron()` = processa webhook → expira pendentes → envia fila. Chamado por `/api/cron` (Bearer `CRON_SECRET`) a cada minuto ou `npm run cron`.
- Claim atômico `QUEUED → SENDING` antes de enviar; retry com backoff só para erros retryable; máx. 5 tentativas.
- Respostas do paciente: `src/lib/whatsapp/replies.ts` (puro, testado). "não" fora do prazo vira `RESCHEDULE_REQUESTED`, não cancela.
- Botões de URL nos templates usam sempre `confirmationToken` como sufixo (`/confirmar/<token>`, `/sessao/<token>`).
- `WHATSAPP_PROVIDER=console`: `ConsoleWhatsAppProvider` loga e marca como SENT — não confundir com entrega real. `SKIPPED` do Notify (opt-out/cota) vira FAILED com o motivo, sem retry.

## Pacientes

- Identidade = (organizationId, whatsapp). Criação manual e pública passam pela mesma unicidade; número de paciente excluído bloqueia recriação e sugere restaurar.
- Exclusão é lógica (`deletedAt`), bloqueada com sessões futuras ativas; encerra `RecurringSeries`. Só OWNER/PROFESSIONAL (`canDeletePatient`). Anonimização definitiva por prazo de retenção: seção LGPD abaixo.
- A ficha mostra só administrativo; o bloco "Prontuário" abre o módulo clínico só para quem `canOpenClinicalRecord` (seção Prontuário abaixo).

## Financeiro

- `Payment` é o histórico (uma linha por recebimento); `Appointment.paymentStatus` é o resumo. Parcial mantém PENDING até a soma atingir `priceCents`.
- "Realizado" = concluídas do mês (por `startsAt`); "Recebido" = `Payment.paidAt` no mês (caixa, independe da data da sessão); "Previsto" = concluídas + confirmadas do mês, passadas ou não — mesma definição no dashboard.
- Valores só para `canViewFinancials` (profissional dono ou OWNER); recepção não vê.
- CSV em `/financeiro/export?month=YYYY-MM`: separador `;` e BOM para o Excel pt-BR.

## Storage de arquivos

- `src/lib/storage/`: interface `StorageProvider`, drivers `local` (public/uploads, dev e VPS) e `s3` (SigV4 manual, testado contra o vetor da AWS; funciona com S3/R2/MinIO). `STORAGE_DRIVER` escolhe.
- Toda chave leva o prefixo `mind/` (`KEY_PREFIX`). Em produção o bucket é exclusivo do produto (`heeca-mind`, regra "cada produto é individual" da plataforma).
- Foto de perfil: recorte quadrado + resize 512px no navegador (canvas, sem `sharp`); servidor valida magic bytes (`src/lib/image.ts`) e 1,5 MB. SVG é recusado (pode carregar script). Chave com timestamp → cache imutável; a anterior é apagada em melhor esforço. `Professional.photoKey` guarda a chave para exclusão.
- Server Actions aceitam até 10 MB (`next.config.ts`) — documentos clínicos vão até 8 MB.
- **Objetos privados** (`putPrivate/getPrivate/deletePrivate`): nunca ganham URL. Driver local grava em `storage/private/` (fora de `public/`; `PRIVATE_STORAGE_DIR` aponta o volume em produção); S3 usa o mesmo bucket com `cache-control: private, no-store`. O chamador grava o conteúdo **já cifrado** — a confidencialidade vem da chave, não do bucket.

## LGPD — retenção e anonimização

- `Organization.retentionYears` (mín. 5, CFP 001/2009), editável só por OWNER na aba Políticas.
- Regra pura em `src/lib/lgpd/retention.ts`: cadastro excluído é anonimizado quando `max(deletedAt, últimoAtendimento) + retentionYears <= agora`. Nunca anonimiza cadastro não excluído.
- `anonymizePatient` (`src/lib/lgpd/anonymize.ts`) é irreversível: zera nome/contato/observações, textos das sessões, payloads de notificações, `before/after` da auditoria; apaga notas clínicas; mantém sessões, valores, status, datas. `whatsapp` vira `anon:<id>` (mantém a unicidade).
- Job roda no `runCron`; `npm run check:lgpd` é o teste de integração. Eventos brutos do webhook são purgados após 90 dias.
- Exportação do titular (art. 18): `GET /pacientes/[id]/export` (JSON), só `canDeletePatient`, auditada como `patient.export`.
- "Anonimizar agora" na ficha exige o cadastro já excluído — dupla confirmação para uma ação sem volta.

## MFA (TOTP)

- `src/lib/mfa/totp.ts` é puro (RFC 6238/4226, testado contra os vetores oficiais); `src/lib/mfa/service.ts` faz ativação em dois passos, verificação no login, códigos de recuperação (sha256, uso único), desativação.
- Login em duas etapas: `authorize()` devolve `sid` (uuid por login) e `mfaPending = user.mfaEnabled`. O proxy redireciona rotas protegidas para `/login/mfa` enquanto pendente; `requireActor()` repete a checagem.
- Liberação: a action de `/login/mfa` grava `MfaVerification(sid)` e chama `unstable_update({ user: { mfaPending: false } })`. O callback `jwt` (versão Node, em `src/auth.ts`) só zera `mfaPending` se a linha existir para aquele `sid` — um `update()` vindo do cliente sem código não muda nada (testado).
- Segredo TOTP fica cifrado (`mfaSecretEnc`, AES-GCM). Operações sensíveis (desativar, regenerar códigos) exigem código atual. Rate limit `mfa:user` 10/15 min.
- `qrcode` é a única dependência nova (QR do `otpauth://`).

## Sessões e revogação

- `user_sessions`: uma linha por login (`sid` do JWT), com IP/dispositivo/último uso. `requireActor()`/`getActor()` chamam `assertActive(sid)` em toda requisição — JWT revogado ou sem linha cai em `/login?revoked=1`. O proxy (edge) não consulta banco; quem derruba é a página/action.
- Revogação automática: redefinir senha revoga todas; ativar MFA revoga as outras. Manual em `/configuracoes/seguranca` (uma ou "sair dos outros dispositivos"). Auditoria `auth.session_revoke*`.
- `lastSeenAt` é atualizado no máximo a cada 5 min (melhor esforço). Cron apaga expiradas/revogadas com >30 dias.
- Após um deploy que introduza esta tabela, JWTs antigos (sem linha) exigem novo login uma vez.

## Clínicas (multi-profissional)

- Papéis: OWNER (tudo), PROFESSIONAL (só o próprio perfil/agenda/valores), RECEPTIONIST (agenda e pacientes de qualquer profissional; nunca valores, configurações ou equipe). `canViewAnyFinancials` esconde valores da recepção em telas cruzadas (menu, ficha do paciente).
- Seletor de profissional: cookie `hp_pro` (`setActiveProfessionalAction`), validado no tenant a cada requisição em `resolveActiveProfessional`. PROFESSIONAL ignora o cookie.
- Equipe (`/configuracoes/equipe`, só OWNER): convites com token hasheado (7 dias) por e-mail; aceite em `/convite/[token]` cria usuário + vínculo (+ perfil com registro profissional/slug) e marca a org como CLINIC. Remover apaga o vínculo, desativa o perfil (agenda preservada) e revoga sessões; bloqueado com sessões futuras.
- Página pública da clínica: `/clinica/[slug]` (Organization.slug) lista profissionais ativos → `/agendar/[slug]`.
- Rotas públicas no proxy: `agendar|confirmar|sessao|convite|clinica|formulario|documento|portal|sso`.
- Migrações com aviso interativo (índice único): `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` para a pasta e `prisma migrate deploy`.

## Deploy (ver docs/DEPLOY.md)

- `src/lib/env.ts` valida o ambiente em `src/instrumentation.ts`; produção exige https, `CRON_SECRET`, chave de 32 bytes; s3 exige credenciais; WhatsApp exige as 4 variáveis juntas. Falha lista todos os problemas.
- `/api/health` (sem auth) faz `SELECT 1`. Headers de segurança em `next.config.ts`.
- Docker: `DOCKER_BUILD=1` ativa `output: standalone`; `docker/entrypoint.sh` roda `migrate deploy` no start; `docker-compose.prod.yml` traz db + app + cron (curl a cada minuto). Fora da Vercel, `AUTH_TRUST_HOST=true`.
- Vercel: `vercel.json` (região gru1 + cron); use URL de banco com pooler; `STORAGE_DRIVER=s3`.
- Seed bloqueado em produção (`ALLOW_SEED=1` força).

## E-mail e avisos ao profissional

- `src/lib/email/`: `EmailProvider` com drivers `console` (default), `smtp` (cliente próprio em `smtp.ts` + partes puras testadas em `smtp-core.ts`; sem nodemailer — conflita com o peer do next-auth) e `resend` (HTTP). `EMAIL_DRIVER`, `EMAIL_FROM`, `SMTP_URL` (smtp:// = STARTTLS, smtps:// = TLS; `?starttls=0` só para Mailpit local), `RESEND_API_KEY`. `npx tsx --conditions=react-server scripts/smtp-check.ts` testa contra um servidor falso e, com `SMTP_CHECK_TO`, contra o real.
- `sendEmail` é síncrono (reset de senha, convite). Avisos ao profissional vão pela **fila**: `notifyProfessional(event)` (`src/lib/pro-notify.ts`) cria `Notification` com `channel: EMAIL` e tipo `PRO_*`; o dispatcher envia com o mesmo claim/retry do WhatsApp e o painel `/mensagens` mostra os dois canais.
- **Nunca conteúdo clínico nem respostas de formulário no e-mail** — só nome, título, data e link. A caixa de e-mail está fora do nosso controle.
- Preferências por usuário em `User.emailNotifications` (`src/lib/pro-notify-prefs.ts`, puro; null = tudo ligado; evento novo nasce ligado). UI em `/configuracoes/notificacoes`. Profissional sem login não recebe.
- Eventos: pedido público, confirmou/cancelou (link ou WhatsApp), reagendamento pedido, formulário respondido, entrou na lista de espera, aceitou/recusou oferta, delegação recebida. Oferta da lista de espera avisa só pelo evento de oferta (não duplica com confirmou/cancelou). `notifyProfessional` nunca lança.
- `TEMPLATES` do WhatsApp é `Record<WhatsAppNotificationType, …>` (= `NotificationType` sem `PRO_*`).

## Cifra e rotação de chave

- `src/lib/crypto-core.ts` é puro e testado; `src/lib/crypto.ts` só liga ao ambiente (`ENCRYPTION_KEY` + `ENCRYPTION_KEY_PREVIOUS`). Todo dado novo leva o `keyId` (8 hex de sha256 da chave) no envelope: texto `k1:<keyId>:<base64>`, blob `\0HPENC\x01<len><keyId>…`. Dado sem envelope é legado: decifra por tentativa em cada chave do chaveiro (o tag do GCM rejeita a errada).
- Rotação: `npm run rotate-key [-- --check]` (`src/lib/key-rotation.ts`) recifra o que não está na chave atual; idempotente, resumível, blob vai para storageKey novo antes de trocar a linha. Procedimento em docs/DEPLOY.md §7.
- **Ao criar um campo cifrado novo, adicione-o a `rotateAllKeys`** — senão a rotação o deixa para trás e a chave antiga não poderá ser removida.

## Prontuário (dados clínicos)

- Regra de acesso decidida em 2026-09-19: `canAccessClinicalData` (pura) = ator é PROFESSIONAL/OWNER **com perfil** e é exatamente o profissional; + `isTreatingProfessional` (banco) = tem/teve sessão com o paciente. Dono sem perfil, dono-psicólogo de outro paciente e recepção: nunca. O seletor de profissional (`activeProfessionalId`) NÃO transfere acesso clínico. Supervisão/substituição só por delegação explícita (seção abaixo).
- **Escopos.** `clinicalScopes(actor, patientId)` devolve os prontuários que o ator vê: o próprio (`delegationId: null`) + um por delegação ativa. `requireClinicalAccess` lança se vazio; `pickWriteScope` decide onde uma nota nova entra (próprio antes de substituição); `canDeleteClinicalEntry` decide exclusão. Nunca filtrar notas por `actor.professionalId` direto — sempre pelos escopos.
- `src/lib/clinical.ts` é o único lugar que cifra/decifra (`crypto.ts`) e registra `ClinicalAccessLog` (READ/WRITE/DELETE/EXPORT). Actions do prontuário não chamam `audit()` — conteúdo clínico nunca entra em `audit_logs`, notificações ou e-mails.
- Notas são imutáveis; exclusão é lógica com motivo e mantém o conteúdo cifrado até a anonimização LGPD (dever de guarda, CFP 001/2009).
- Tipos: EVOLUTION (vinculada a sessão; uma por sessão), NOTE, ASSESSMENT. `/pacientes/[id]/prontuario/imprimir` gera a versão para PDF e registra EXPORT.
- Verificação de leitura: `pg_dump | grep <palavra da nota>` deve dar 0.

## Documentos clínicos (anexos do prontuário)

- `ClinicalDocument`: PDF/JPG/PNG/WebP até 8 MB, tipo identificado por magic bytes (`src/lib/document.ts`, puro e testado). SVG, Office e HTML são recusados — exportar em PDF.
- O arquivo é cifrado com `encryptBytes` (AES-GCM, mesma chave) **antes** de ir ao storage privado; título, descrição e nome do arquivo também são cifrados. Em claro no banco só `kind`, `contentType`, `sizeBytes` e `storageKey`.
- Mesma regra de acesso das notas (`requireClinicalAccess`). Entrega só por `GET /pacientes/[id]/prontuario/documentos/[docId]` (route handler), que decifra e responde com `Content-Disposition`, `no-store` e `CSP: sandbox` — um PDF com script não age nesta origem. `?download=1` força download.
- Log: WRITE no upload, READ ao abrir/baixar (não ao listar — listar decifra só metadados), DELETE na exclusão. `ClinicalAccessLog` aponta para nota **ou** documento.
- Exclusão é lógica com motivo; o blob fica até a anonimização, que apaga linhas (na transação) e blobs (depois, via `purgeDocumentBlobs`; falhas vão para o log do cron e para o `audit.after.blobsFailed`). `npm run check:lgpd` cobre linha + blob.
- A impressão lista os anexos como índice ("entregues em separado"); não embute o conteúdo.

## Delegação de acesso clínico (supervisão / substituição)

- `ClinicalDelegation`: o **titular** (profissional do ator) concede a outro profissional ativo da mesma organização, com login, acesso ao prontuário de um paciente (`patientId`) ou de todos os seus (`null`), por prazo (máx. 90 dias, nunca retroativo) e com motivo. SUPERVISION = leitura; SUBSTITUTION = leitura + registro. Regras puras e testadas em `src/lib/clinical-delegation.ts`.
- Delegar **não cria relação clínica**: "todos os pacientes" só abre os que o titular de fato atende (`isTreatingProfessional` do titular, checado a cada uso). Dono e recepção não delegam nem recebem; ninguém delega o prontuário de outro.
- Nota/documento registrado em substituição leva `professionalId` do titular (o prontuário é dele), `authorUserId` do substituto e `delegationId`. A UI mostra "(em substituição)". O substituto exclui só o que ele mesmo escreveu; supervisor não escreve nem exclui.
- Todo acesso por delegação grava `delegationId` no `ClinicalAccessLog`; o painel "Acessos recentes" do titular mostra "· supervisão/substituição". Conceder/revogar são auditados em `audit_logs` (`clinical_delegation.grant|revoke`) — metadados, nunca conteúdo.
- Revogação vale na requisição seguinte (escopos são resolvidos a cada acesso, sem cache). Gestão em `/configuracoes/delegacoes`; o prontuário mostra "Compartilhado com" para o titular e um aviso para o delegado.
- Detalhe da sessão usa `canWriteFor(actor, patientId, professionalId)` para o botão "Registrar evolução" — próprio ou substituição.

## Lista de espera

- `WaitlistEntry`: uma ativa por (paciente, profissional); preferências frouxas (modalidade, dias, períodos), serviço opcional, prioridade, origem PUBLIC_PAGE/MANUAL. Regras puras em `src/lib/waitlist-match.ts` (`matchesSlot`, `sortWaitlist` = prioridade → ordem de chegada). Servidor em `src/lib/waitlist.ts`.
- **A oferta é um `Appointment` AWAITING_CONFIRMATION com `source: WAITLIST`** — reserva o horário, ganha token, expira pelo `expirePendingBookings` e é confirmada/recusada em `/confirmar/[token]` ou por resposta no WhatsApp. Nada é oferecido automaticamente: sempre um clique do profissional/recepção (`offerSlot`), respeitando conflitos duros, não a grade.
- `syncWaitlistForAppointment` reflete o destino do agendamento na entrada (CONFIRMED → BOOKED; cancelado/expirado → volta a WAITING, `offersCount`++). Chamado no `transition()` da agenda, em `/confirmar`, nas respostas do WhatsApp e na expiração; `syncWaitlistOffers` no cron é a rede de segurança.
- Entrada pública: `/agendar/[slug]/espera` (links nos "sem horário" do fluxo), mesmo rate limit e honeypot do agendamento; repetir só atualiza preferências. Confirmação por template `WAITLIST_JOINED`; oferta por `WAITLIST_OFFER` (botão para `/confirmar/<token>`).
- Painel `/agenda/espera` segue o seletor de profissional; `canManageSchedule`. Na sessão cancelada/expirada futura, `candidatesForSlot` lista quem combina com "Oferecer" em 1 clique. Remover com motivo cancela a oferta em aberto. Excluir paciente remove entradas WAITING; anonimização limpa `note`.

## Formulários pré-atendimento

- `FormTemplate` (por profissional): campos em JSON validados por `src/lib/forms-schema.ts` (puro, testado): short_text, long_text, yes_no, single_choice, multi_choice, scale 0–10, date, info. Editor em `/configuracoes/formularios` (`canEditProfessional`); "Instalar modelos iniciais" cria ficha inicial (auto na 1ª sessão), termo online e check-in.
- **`dataClass` decide onde a resposta cai**: CLINICAL → `answersEnc` (AES-GCM), leitura por `readAnswers` só com `clinicalScopes` (próprio ou delegado) + `ClinicalAccessLog.formRequestId`; ADMINISTRATIVE (termos) → `answersJson` em claro, leitura por `canManageSchedule`. Perguntas sobre a pessoa são clínicas; aceites são administrativos.
- `FormRequest` guarda **snapshot** dos campos + `tokenHash` (sha256; token só na mensagem). Link público `/formulario/[token]` (rota pública no proxy), uso único, expira em 30 dias (cron `expireFormRequests`). Reenviar gera token novo e invalida o anterior. Validação das respostas é contra o snapshot (`validateAnswers`), nunca contra o modelo atual.
- Envio: painel `FormsPanel` na ficha e no detalhe da sessão (`canManageSchedule`); template WhatsApp `FORM_REQUEST` com botão `/formulario/<token>`. Automático: `autoSendFirstSessionForms` no cron envia modelos marcados a pacientes com 1ª sessão CONFIRMED futura e sem histórico com o profissional.
- Excluir paciente cancela pedidos PENDING; anonimização apaga `form_requests` do paciente.
