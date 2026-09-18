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
| 2 Configuração do consultório | ⬜ schema pronto, UI pendente |
| 3 Serviços | ⬜ schema pronto, UI pendente |
| 4 Agenda | ⬜ schema pronto; cálculo de disponibilidade pendente |
| 5 Pacientes | ⬜ schema pronto |
| 6 Agendamento público | 🟡 perfil renderiza; fluxo de escolha de horário pendente |
| 7 WhatsApp | 🟡 provider + templates + webhook (persistência); envio/fila pendente |
| 8 Dashboard | 🟡 contadores básicos |
| 9 Financeiro | ⬜ schema pronto |
