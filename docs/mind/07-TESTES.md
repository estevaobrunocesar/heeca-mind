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

## 3. E2E (Playwright, novo — hoje não há)

Cinco jornadas, contra o app com Notify e portal simulados:
1. **Onboarding**: provision → SSO → checklist de onboarding → serviço → grade → página pública no ar.
2. **Agendamento público → confirmação → lembrete → conclusão → pagamento** (F2 + F5).
3. **Recorrência**: série semanal → cancelar uma → reagendar uma → encerrar série.
4. **Documento**: modelo → envio → aceite por link → PDF no portal do paciente.
5. **Portal do paciente**: link mágico → reagendar dentro da política → tentar fora da política (negado) → pacote com saldo.

Mais dois **negativos** obrigatórios: recepção tenta abrir prontuário (404); usuário do tenant A acessa id do tenant B (404).

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

| Momento | Comando |
|---|---|
| a cada commit | `npm run typecheck && npm test` |
| antes de abrir PR | `npm run check:lgpd && npm run check:heeca && npm run check:notify && npm run check:packages` |
| release | E2E + checklist de segurança §4 + restore de backup e leitura de nota cifrada |
