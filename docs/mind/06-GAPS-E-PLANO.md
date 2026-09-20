# 06 — Gaps, plano e critérios de aceite

## 1. Briefing × Psico, item a item

| § | Item do briefing | Estado | O que falta |
|---|---|---|---|
| 4 | Consumir o Core | ❌ | provision/entitlement/SSO, Notify, R2 próprio, catálogo, `@heeca/ui` |
| 5 | Perfis | 🟡 | papel `FINANCE`; sessão de paciente |
| 6 | Cadastro da clínica | 🟡 | campos legais/contato/logo em `Organization`; política padrão |
| 7 | Cadastro do profissional | 🟡 | `registrationKind/Number` genérico (hoje `crp` fixo) — resto existe |
| 8 | Serviços | 🟡 | sinal/pagamento antecipado, cancelamento por serviço; N:N é D1 |
| 9 | Agenda (visões e status) | ✅ | status "Em atendimento" não existe (`IN_PROGRESS`) — adicionar à máquina de estados; "Reagendar" = `RESCHEDULE_REQUESTED` ✅ |
| 10 | Recorrência | ✅ | `MONTHLY` opcional |
| 11 | Online | ✅ | — |
| 12 | Cliente (camada administrativa) | 🟡 | nascimento, endereço, contato de emergência, tags, preferências de comunicação |
| 13–14 | Clínico isolado e seguro | ✅ (além do MVP) | nada — não expandir |
| 15 | Documentos e consentimentos | ❌ | módulo `documents` (modelo, envio, aceite, PDF, versão) |
| 16 | WhatsApp administrativo | 🟡 | provider Notify + templates unificados; conteúdo já é fechado por template |
| 17 | Portal do cliente | ❌ | `/portal` com link mágico (D4) |
| 18 | Página pública | ✅ | mostrar valores conforme `showPrices` ✅; localização ✅ |
| 19 | Agendamento online | ✅ | + documentos obrigatórios e sinal no fluxo |
| 20 | Pacotes | ❌ | módulo `packages` |
| 21 | Assinaturas do paciente | — | Fase 2 (fora) |
| 22 | Lista de espera | ✅ | — |
| 23 | Cancelamento/no-show configurável | 🟡 | regra do sinal × prazo (D2/D5); política já existe |
| 24 | Financeiro básico | ✅ | + pacotes e "origem" no CSV; status REEMBOLSADO (hoje: desfazer) |
| 25 | Comissões | ❌ | módulo `commissions` |
| 26 | Dashboard | 🟡 | cards de clientes (novos/ativos/recorrentes/inativos), ocupação, lista de espera, ticket médio |
| 27 | Indicadores | 🟡 | `/relatorios`: receita por profissional/serviço, ocupação, retenção, no-show — regras puras + SQL |
| 28 | Reativação | ❌ | consulta + envio por clique |
| 29 | Pesquisa de experiência | ❌ | `ExperienceSurvey` + link público |
| 30 | Multi-profissional | ✅ | + comissão |
| 31 | Multiunidade | ✅ tabela | `Unit` + `unitId?` em Professional/Appointment criados (sem telas); Fase 2 liga |
| 38 | UX padrão Heeca | ❌ | adotar `ui/` (tokens, casca, `layout.md`) |
| 39 | Menu | 🟡 | renomear/reordenar: Dashboard · Agenda · Clientes · Serviços · **Pacotes** · **Documentos** · Financeiro · **Relatórios** · WhatsApp(=Mensagens) · Configurações · [Clínico] |

## 2. Plano por etapas (ordem de dependência, não de valor)

**Estado em 20/09/2026 — todas as etapas executadas na branch `mind` (commits 65f1a63 … 5419f01 e o de release):**

| Etapa | Estado | Commit |
|---|---|---|
| 0 Rebranding, segmento, registro genérico, casca clean | ✅ | 65f1a63, b1f21d0 |
| 1 Integração com o Core (portal + Notify) | ✅ | 2090b7d |
| 2 FINANCE, IN_PROGRESS, ficha §12, tags, clínica §6 | ✅ | fce3897, 95f3df1 |
| 3 Pacotes | ✅ | f77792f |
| 4 Documentos e consentimentos | ✅ | a438fd6 |
| 5 Portal do paciente | ✅ | 1d86511 |
| 6 Comissões | ✅ | fc3d432 |
| 7 Dashboard, relatórios, reativação, pesquisa | ✅ | 5419f01 |
| 8 Endurecimento | ✅ | `check:tenant`, `check:lgpd`, dump-grep, build; E2E Playwright (`npm run e2e`, 7 specs) entregue depois do merge |

O que **depende da plataforma** para o Mind ir ao ar está em `docs/DEPLOY.md` §5 e na seção 8 deste documento.



Estimativas em dias de trabalho de um agente com revisão do Bruno; cada etapa termina com testes verdes, `CLAUDE.md` atualizado e commit.

### Etapa 0 — Rebranding e casca (2 d)
Renomear Hecca Psico → Heeca Mind (UI, e-mails, `EMAIL_FROM`, prefixo `mind/` no storage, `package.json`, README/SPEC/DEPLOY); `data-accent="mind"` + casca `layout.md` (topbar branca com filete, sidebar clara, um primário por tela); menu do §39. `Organization.segment`, `registrationKind/Number`.

### Etapa 1 — Integração com o Core (3 d) — desbloqueia a prateleira
`src/lib/heeca/` (provision, entitlement, SSO) copiado do Dental e adaptado ao `Organization`/`Membership`; gate `/bloqueado`; `/cadastro` → portal; `env.ts`; provider `NotifyWhatsAppProvider` + `/api/webhooks/notify` + mapeamento de templates; remoção do webhook Meta; `docs/DEPLOY.md` com variáveis; **simulador** local (script que assina como o portal/Notify, igual ao usado no Move). Ao fim: avisar o chat da plataforma (catálogo, segredos, DNS, Coolify, templates `heeca_mind_*`).

### Etapa 2 — CRM e clínica completos (2 d)
Campos do §6 e §12, tags, `commsPrefs`, `lastCompletedAt`, papel `FINANCE`, status `IN_PROGRESS`, anonimização estendida, exportação do titular atualizada.

### Etapa 3 — Pacotes (3 d)
Catálogo, venda, vínculo na sessão, consumo no `transition()` (D2), reversão, expiração no cron, `Payment.packagePurchaseId`, financeiro e CSV, ficha e página pública ("vitrine" opcional).

### Etapa 4 — Documentos e consentimentos (3 d)
Modelos versionados com variáveis, envio (ficha/sessão/automático antes da 1ª sessão), `/documento/[token]`, aceite com hash, PDF privado, template `heeca_mind_documento`, migração dos `FormTemplate` administrativos.

### Etapa 5 — Portal do paciente (3 d)
Link mágico (D4), `PatientSession`, próximas sessões, reagendar/cancelar pela política, pagamentos/pacotes, documentos, dados, revogação pela recepção.

### Etapa 6 — Comissões (2 d)
Regras, lançamentos por evento (D3), fechamento, ajuste, tela e CSV.

### Etapa 7 — Dashboard, relatórios, reativação, pesquisa (3 d)
Cards do §26, `/relatorios` (§27) com regras puras, reativação por clique, `ExperienceSurvey` + `/pesquisa/[token]`, média no dashboard.

### Etapa 8 — Endurecimento e release (2 d)
`tests/tenant-isolation`, E2E dos fluxos F1/F2/F7/F9, checklist §41, `pg_dump | grep`, restore de backup + leitura de nota cifrada, revisão de `permissions.test.ts` com `FINANCE` e paciente.

**Total: ~23 dias.** Depois da Etapa 1 o produto já pode entrar na prateleira como "em breve" e receber provisionamento sintético; a partir da Etapa 5 cobre o §41 inteiro.

## 3. Critérios de aceite do MVP (§41) → onde se prova

| # | Critério | Etapa | Prova |
|---|---|---|---|
| 1 | Criar conta | 1 | provision + SSO com simulador; E2E |
| 2 | Configurar perfil | 0 | `/configuracoes/perfil` (existe) + registro genérico |
| 3 | Criar serviços | ✅ | existe |
| 4 | Configurar horários | ✅ | existe (`AvailabilityRule`, exceções, bloqueios) |
| 5 | Cadastrar clientes | 2 | ficha completa |
| 6 | Página pública | ✅ | `/agendar/[slug]` |
| 7 | Receber agendamento | ✅ | fluxo F2 |
| 8 | Confirmar atendimento | 1 | via Notify (botão) ou painel |
| 9 | Recorrência | ✅ | existe |
| 10 | Enviar lembrete | 1 | `heeca_lembrete` pelo Notify |
| 11 | Presencial ou online | ✅ | existe |
| 12 | Registrar atendimento administrativo | ✅ | status + `adminNote` |
| 13 | Receber pagamento | ✅ | `Payment` |
| 14 | Controlar pacote | 3 | saldo derivado, consumo, expiração |
| 15 | Histórico administrativo | ✅ | ficha |
| 16 | Dashboard | 7 | cards do §26 |
| 17 | Gerenciar documentos | 4 | módulo documents |
| 18 | Controlar permissões | 2 | `FINANCE` + equipe |

## 4. Fora do MVP (registrado para não virar escopo escondido)

Assinatura recorrente do paciente (§21), gateway de pagamento do paciente, multiunidade com telas (§31), videoconferência integrada, IA, BI, app, assinatura qualificada, subdomínio por tenant, N:N serviço×profissional (D1-b), campanhas.

## 5. ⚑ Decisões (fechadas em 20/09/2026 — Bruno aprovou as recomendações)

| # | Decisão | Opções | Recomendação | Trava |
|---|---|---|---|---|
| D1 | Serviço por profissional ou da clínica (N:N) | (a) 1:N como hoje · (b) `ServiceProfessional` | (a) no MVP | Etapa 3 e página pública |
| D2 | Quando o pacote consome sessão | (a) só `COMPLETED` · (b) + `NO_SHOW` por política · (c) reserva no `CONFIRMED` | (a)+(b) configurável | Etapa 3 |
| D3 | Base da comissão | recebido (caixa) · realizado (sessões) | recebido | Etapa 6 |
| D4 | Login do paciente no portal | link mágico por WhatsApp · e-mail + senha | link mágico | Etapa 5 (e depende do Notify em produção) |
| D5 | Sinal no MVP | manual (chave Pix + confirmação) · gateway | manual | Etapa 3/5 |
| D6 | Anonimização de termos aceitos | apagar tudo · manter PDF+hash, anonimizar nome/IP | manter PDF+hash | Etapa 4 |
| D7 | Nome/cor do produto e `data-accent="mind"` | kit de marca | — | Etapa 0 (plataforma) |
| D8 | Domínio público | `mind.heeca.com.br/agendar/<slug>` · wildcard por tenant | caminho por slug | Etapa 1 |
| D9 | Registrar no `ecosystem.ts`/`PENDENCIAS.md` que Health tem dois motores (Dental, Mind) e Nutri/Fono nascem do Mind | sim · não | sim | plataforma |

Todas implementadas conforme a coluna "Recomendação", exceto D7 (cor do produto), que continua provisória (`--primary` sálvia em `globals.css`) até o kit de marca.

## 6. Ajustes de rota feitos durante a execução (não previstos no plano)

- `heeca_lembrete` unificado tem botões quick_reply → sessões criadas manualmente ganham `confirmationToken` sob demanda ao enfileirar (bug real pego no E2E da etapa 5).
- `/agenda/novo` em modo "Já cadastrado" não envia `newPatientName`/`newPatientWhatsapp`; o schema exigia string → erro em campos não renderizados e formulário mudo. Corrigido em `validation/appointment.ts` (ausência = vazio) com teste unitário; pego pela suíte E2E (`03-recorrencia`).
- Cliente Prisma gerado passa a ser CJS (`moduleFormat = "cjs"`): o transpilador do Playwright carrega TS como CommonJS e o `import.meta` do cliente ESM quebrava as fixtures. Next/tsx indiferentes.
- Portal do paciente é por slug do profissional (`/portal/<slug>`): é o que dá o tenant; a sessão vale para a organização inteira.
- "PDF" de documentos = página de impressão com hash (padrão do prontuário e do Dental); sem dependência de geração de PDF.
- Pacotes e documentos pertencem ao profissional (coerente com D1); `FormTemplate` administrativos antigos continuam válidos como questionários.
- Comissão sobre pacote: percentual sobre o valor pago; valor fixo proporcional às sessões pagas.

## 7. Dívidas conhecidas (não bloqueiam o §41)

- Cor de acento do Mind (D7).

## 8. Tarefas da plataforma para a prateleira (chat da plataforma)

1. Catálogo `mind` (planos/preços, `PRODUCT_MIND_*`, `provisionUrl` = `https://mind.heeca.com.br/api/heeca`, segredo = `HEECA_PLATFORM_SECRET`).
2. Notify: `NOTIFY_SECRET_MIND`; `mind` na regex de produtos do `validateTemplate`; templates `heeca_mind_*` (7: lembrete_2h, sessao_online, lista_espera, oferta_horario, formulario, documento, acesso_portal, pesquisa) no catálogo/Meta.
3. Portal: redirecionador `/a/mind/<slug>` → `https://mind.heeca.com.br/agendar/<slug>`.
4. R2 `heeca-mind` + token; Coolify (`heeca-mind`, `heeca-mind-db`, cron `/api/cron`); DNS `mind.heeca.com.br`; monitor; `data-accent="mind"` no `ui/tokens.css`.
5. `ecosystem.ts`/`PENDENCIAS.md`: Health com dois motores (D9).
