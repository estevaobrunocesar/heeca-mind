# 07 — Estratégia de testes

Base existente: `npm test` (19 suítes de regras puras), `npm run check:lgpd` (integração real de anonimização), `scripts/smtp-check.ts`. Princípio do repo mantido: **toda regra de negócio nasce pura em `rules.ts` e é testada sem banco**; o banco entra só em serviços finos.

## 1. Unitários (puros, vitest) — por módulo novo

| Módulo | Arquivo | O que prova |
|---|---|---|
| heeca | `tests/heeca-signature.test.ts` | HMAC válido/inválido, janela de 5 min, tempo constante, JWT `aud/exp/iss`, `jti` repetido, `next` só relativo |
| notify | `tests/notify-provider.test.ts` | montagem do corpo por `NotificationType` (nome do template, `bodyParams` na ordem, botão com sufixo do token), tratamento de `SKIPPED`, mapeamento de `InboundEvent` → evento interno, rejeição de `tenantId` divergente |
| packages | `tests/package-rules.test.ts` | saldo derivado com reversões, compatibilidade serviço/profissional, expiração por data civil no fuso da org, decisão D2 (COMPLETED / NO_SHOW por política), idempotência do consumo |
| commissions | `tests/commission-rules.test.ts` | precedência serviço > geral, `percentBp` × `fixedCents`, rateio de pacote por sessão, período fechado recebe ajuste negativo, arredondamento em centavos |
| documents | `tests/document-rules.test.ts` | `extractFields`/`renderTemplate` com `missing`, `documentHash` canônico, `acceptanceHash`, versionamento (corpo igual não cria versão), expiração |
| portal | `tests/portal-rules.test.ts` | token só hash, uso único, janela de reagendamento pela `ProfessionalPolicy`, campos editáveis (nunca `whatsapp`) |
| permissions | `tests/permissions.test.ts` (existe) | + `FINANCE` em todas as funções; paciente nunca entra em `canAccessClinicalData`; seletor não transfere clínico |
| status | `tests/appointment-status.test.ts` (novo) | `IN_PROGRESS` nas transições; efeitos colaterais declarados (pacote, comissão, pesquisa) por status |
| dashboard/reports | `tests/report-rules.test.ts` | ocupação (minutos trabalhados × ocupados), retenção, ticket médio, novos/ativos/inativos por janela |
| lgpd | `tests/retention.test.ts` (existe) + `anonymize` | novos campos zerados; D6 (PDF+hash mantidos) |

## 2. Integração (banco real, `docker compose up`)

| Script | Prova |
|---|---|
| `npm run check:lgpd` (existe, estender) | anonimização cobre `emergencyContact*`, documentos, pesquisa, sessões do portal |
| `npm run check:heeca` (novo) | simulador assina `provision` duas vezes → um tenant; `entitlement blocked` → `/bloqueado`; SSO cria usuário e sessão; MFA pendente respeitado |
| `npm run check:notify` (novo) | Notify falso local: enfileira → `202` → callback `status` → `button_reply confirm:<token>` → `Appointment CONFIRMED`; callback com `tenantId` errado → ignorado |
| `tests/tenant-isolation.test.ts` (novo) | para cada modelo com `organizationId`, cria dois tenants e garante que serviços de leitura/escrita do outro tenant retornam vazio/404 (tabela-dirigido, roda em CI) |
| `npm run check:packages` (novo) | vende, agenda, conclui, reverte, expira — saldo e financeiro batem |

## 3. E2E (Playwright — `npm run e2e`)

Suíte em `tests/e2e/` (Playwright 1.63, Chromium, 1 worker, `fullyParallel: false`). O `webServer` do config faz `next build && next start` com `E2E=1` (única chave que libera `http://` na validação de produção do `env.ts` — nunca setar em deploy). Pré-requisitos: banco local de pé, `.env` com `HEECA_PLATFORM_SECRET`, **dev server parado** (build + dev ao mesmo tempo corrompe `.next`). `PW_REUSE=1` reaproveita um servidor já de pé; `E2E_KEEP=1` não apaga os dados no fim.

**Porta:** o Windows (Hyper-V/WSL) reserva faixas dinâmicas a cada reinício e a 3000 pode cair dentro de uma — o sintoma é `listen EACCES` no build, não teste vermelho (`netsh interface ipv4 show excludedportrange protocol=tcp` lista as faixas). Use `E2E_PORT=3500 npm run e2e`: o config leva a porta para `NEXT_PUBLIC_APP_URL` (URLs de upload/portal, embutidas no build) e para `AUTH_URL` (destino dos redirects de login/SSO). Sem o `AUTH_URL`, o navegador é mandado para a porta do `.env` e toda navegação com redirect morre em `ERR_CONNECTION_REFUSED` — com o servidor de pé e respondendo.

Fixtures (`fixtures.ts`): cada spec cria seu próprio tenant com prefixo `e2e-` direto no banco (dono-psicóloga, recepção, serviço híbrido, grade seg–sex 09–18, paciente) — o app só é exercitado pelo navegador/HTTP. `lastButtonToken()` lê a fila de notificações como o paciente leria o WhatsApp (botão de URL). O teardown apaga tudo com prefixo `e2e-`.

| Spec | Jornada | O que prova |
|---|---|---|
| `01-onboarding` | F1 | provision assinado (idempotente por subscriptionId; sem assinatura → 401) → SSO cria sessão e cai no dashboard → replay do link → `login?sso_error` → criar serviço; org com `accessState=OK`, `segment=PSYCHOLOGY` |
| `02-agendamento` | F2 + F5 | página pública → slot → formulário com consentimento → `AWAITING_CONFIRMATION` + `heeca_confirmacao` na fila → paciente confirma pelo token → profissional conclui → registra pagamento → `PAID`, 25000, pesquisa agendada |
| `03-recorrencia` | F3 | série semanal (4) → cancelar só a 2ª → cancelar a série a partir da 3ª (1ª intacta, série inativa) |
| `04-documento` | F7 | instalar modelos → enviar da ficha → link: nome divergente recusado, nome do cadastro aceito → `ACCEPTED` com hash de 64 hex → registro interno + e-mail ao profissional na fila |
| `05-portal` | F9 | pedido de link → token da fila → home → reagendar sessão a 7 dias (`rescheduled=1`) → sessão a 3 h: política de 24h bloqueia (sem botão de cancelar) → "Meus dados" salva endereço → sair e reusar token → `portal?invalid=1` |
| `06-negativos` | §41 | recepção no prontuário vê "Acesso restrito" e nenhum `ClinicalAccessLog`; tenant B em paciente/prontuário/sessão/export do A → 404 e lista sem o paciente; `/documento/<lixo>` → 404; rota do portal sem cookie volta ao pedido de acesso |
| `07-clinica` | §6 (+ storage) | responsável envia logo (PNG 1×1 via `setInputFiles`) → chave `organizations/<org>/logo-*.png`, aparece em `/agendar` (CLINIC) e no portal, arquivo servido; recepção não vê o uploader; remoção zera colunas, apaga o arquivo (404) e audita `organization.logo*` |

Fora da suíte por enquanto: lembrete (cron), PDF do documento no portal (é a mesma página do aceite), pacote com saldo no portal (coberto por `package-rules.test.ts`).

## 4. Segurança

- `pg_dump | grep` de uma frase de nota clínica = 0 (já é verificação do repo; vira passo do release).
- Rate limit: 4ª tentativa de link do portal no mesmo telefone em 1 h → 429.
- Headers: `no-store` + `CSP: sandbox` em todo route handler de arquivo privado (documento clínico e PDF administrativo).
- HMAC replay: mesmo corpo com timestamp de 6 min → 401; `jti` repetido no SSO → 401.
- `npm audit --production` e `npm run typecheck` no CI.
- Revisão manual por release: `permissions.ts` (diff) e `anonymize.ts` (diff) — os dois arquivos onde um erro é irreversível.

## 5. Desempenho (mínimo)

- Agenda semanal de clínica com 20 profissionais × 8 semanas materializadas: `< 300 ms` no `getWeek` (índice `(organizationId, professionalId, startsAt)`).
- Disponibilidade pública: `availability.ts` é puro; medir com 12 meses de bloqueios (já há teste de regra; adicionar um de tamanho).
- Cron de 1 min: cada job com teto de lote (fila 200, expiração 500, materialização 4 semanas) para nunca passar de 60 s.

## 6. O que roda onde

Estado em 20/09/2026: `npm test` = 191 testes puros (heeca-core, notify, registration, br-document, package-rules, document-rules, commission-rules, report-rules, permissions com FINANCE e comissões, appointment-status…); `npm run check:tenant` (19 tentativas cruzadas bloqueadas) e `npm run check:lgpd` verdes; `npm run heeca:sim` cobre provision/entitlement/SSO/Notify. `npm run e2e` = 7 specs Playwright (§3) contra build de produção.


| Momento | Comando |
|---|---|
| a cada commit | `npm run typecheck && npm test && npx eslint src` |
| a cada PR | `npm run build` — o `tsc` não detecta módulo cliente importando Prisma (Turbopack sim) |
| antes de abrir PR | `npm run check:lgpd && npm run check:tenant` (+ `npm run heeca:sim` contra o dev server) |
| release | E2E + checklist de segurança §4 + restore de backup e leitura de nota cifrada |
