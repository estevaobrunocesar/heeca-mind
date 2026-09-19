# Hecca Psico

SaaS multi-tenant de agenda e agendamento online para psicólogos. Spec completa em `docs/SPEC.md`.

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
npm run dev
npm run cron                  # roda dispatcher/expiração/webhook uma vez (dev)
npm run webhook:sim -- message +5511999990000 "sim"   # simula resposta do paciente
npm test
npm run typecheck
```

## Convenções que não se derivam do código

- **Tenant sempre explícito.** Toda query em entidade com `organizationId` filtra por `actor.organizationId`. Use os helpers de `src/lib/tenant.ts`. Nunca confie em id vindo do cliente sem verificar o tenant.
- **Ator via `requireActor()`** (`src/lib/session.ts`) em Server Components/Actions. Autorização em `src/lib/permissions.ts` — funções puras, sem banco.
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
| 5 Pacientes | ✅ listagem com busca/filtros, ficha com histórico e indicadores, criar/editar, exclusão lógica LGPD + restauração |
| 6 Agendamento público | ✅ modalidade → mês → dia → horário → dados + LGPD; confirmação/cancelamento por token |
| 7 WhatsApp | ✅ dispatcher com retry, webhook (status + respostas), expiração de pendentes, link de sessão, painel /mensagens — falta só credenciais reais da Meta |
| 8 Dashboard | 🟡 contadores básicos |
| 9 Financeiro | ⬜ schema pronto |

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
- Pendente: rate limit no formulário público (há honeypot `website`, mas não há limite por IP).

## WhatsApp (ver docs/WHATSAPP.md)

- `src/lib/whatsapp/dispatcher.ts`: `runCron()` = processa webhook → expira pendentes → envia fila. Chamado por `/api/cron` (Bearer `CRON_SECRET`) a cada minuto ou `npm run cron`.
- Claim atômico `QUEUED → SENDING` antes de enviar; retry com backoff só para erros retryable; máx. 5 tentativas.
- Respostas do paciente: `src/lib/whatsapp/replies.ts` (puro, testado). "não" fora do prazo vira `RESCHEDULE_REQUESTED`, não cancela.
- Botões de URL nos templates usam sempre `confirmationToken` como sufixo (`/confirmar/<token>`, `/sessao/<token>`).
- Sem credenciais da Meta, `ConsoleWhatsAppProvider` loga e marca como SENT — não confundir com entrega real.

## Pacientes

- Identidade = (organizationId, whatsapp). Criação manual e pública passam pela mesma unicidade; número de paciente excluído bloqueia recriação e sugere restaurar.
- Exclusão é lógica (`deletedAt`), bloqueada com sessões futuras ativas; encerra `RecurringSeries`. Só OWNER/PROFESSIONAL (`canDeletePatient`). Anonimização definitiva por prazo de retenção é job futuro.
- A ficha mostra só administrativo; o bloco "Prontuário" é placeholder até o módulo clínico (`canAccessClinicalData`).
