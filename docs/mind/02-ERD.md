# 02 — Modelo de dados (ERD)

Fonte: `hecca_psico/prisma/schema.prisma` (46 modelos/enums hoje). Abaixo: o que fica, o que muda, o que nasce. Convenções mantidas: `cuid()`, dinheiro em centavos `Int`, datas UTC, datas civis `@db.Date`, exclusão lógica com `deletedAt`, `@@map` snake_case.

## 1. Mapa (§35 do briefing → tabelas reais)

```
ORGANIZATION (tenant)  ─── heecaSubscriptionId (portal)
 ├── USERS            User · Membership(role) · Invitation · UserSession · MfaVerification · PasswordResetToken
 ├── PROFESSIONALS    Professional · ScheduleSettings · ProfessionalPolicy · AvailabilityRule · ScheduleBlock · ScheduleException
 ├── SERVICES         Service
 ├── CLIENTS (CRM)    Patient · Tag* · PatientTag* · WaitlistEntry
 ├── APPOINTMENTS     Appointment · RecurringSeries
 ├── PAYMENTS         Payment · Receipt · CommissionRule* · CommissionEntry* · CommissionClosing*
 ├── PACKAGES         Package* · PackagePurchase* · PackageConsumption*
 ├── DOCUMENTS        DocumentTemplate* · DocumentRequest*          (administrativos; em claro)
 ├── COMMUNICATION    Notification · WhatsAppWebhookEvent · ExperienceSurvey* · ReactivationContact*
 ├── PORTAL           PatientAccessToken* · PatientSession*
 ├── SECURITY         AuditLog · AccessLog · RateLimit
 └── CLINICAL_DATA    ClinicalNote · ClinicalDocument · ClinicalDelegation · ClinicalAccessLog ·
                      FormTemplate · FormRequest(answersEnc)        (cifrados; autorização própria)
```
`*` = novo. Tudo em `CLINICAL_DATA` já existe e **não muda** neste projeto.

A regra do §35 ("não usar o mesmo mecanismo de autorização para todos os dados") é satisfeita hoje por construção: dados administrativos passam por `permissions.ts` + `tenant.ts`; dados clínicos só entram/saem por `src/lib/clinical.ts` (cifra + `clinicalScopes` + `ClinicalAccessLog`). Nenhuma tabela nova deste projeto é clínica.

## 2. Alterações em tabelas existentes

### Organization
```prisma
// integração com o portal (heeca_site/docs/ENTITLEMENT.md)
heecaSubscriptionId  String?  @unique
heecaAccountId       String?
planCode             String?
planFeatures         String[] @default([])
planLimits           Json?            // { maxProfessionals: 3, ... }
accessState          AccessState @default(OK)   // OK | WARNING | BLOCKED (espelho de entitlement.access)
entitlementSyncedAt  DateTime?
// cadastro da clínica (§6) — hoje só existe name/type/slug/timezone/retentionYears
legalName            String?
document             String?          // CPF/CNPJ só dígitos
phone                String?
whatsapp             String?
email                String?
website              String?
instagram            String?
logoKey              String?
addressLine/City/State/Zip  String?
segment              Segment @default(PSYCHOLOGY)   // §40: PSYCHOLOGY | THERAPY
offersOnline         Boolean @default(true)
offersInPerson       Boolean @default(true)
```
Políticas (cancelamento, atraso, falta, pagamento) **continuam por profissional** em `ProfessionalPolicy`; a clínica ganha um `defaultPolicy` Json usado ao criar profissional. Sem tabela nova.

### Professional
```prisma
registrationKind     String  @default("CRP")   // CRP | CRN | CRFa | NONE — §7
registrationNumber   String?                   // migração: copia de crp
showRegistration     Boolean @default(true)    // renomeia showCrp
unitId               String?                   // §31, nulo no MVP
```
`crp` sai depois de duas migrações (adicionar → copiar → remover), como o padrão de rotação de chave do repo.

### Patient (camada administrativa, §12)
```prisma
birthDate            DateTime? @db.Date
phone                String?              // além de whatsapp
addressLine/City/State/Zip  String?
emergencyContactName String?
emergencyContactPhone String?
commsPrefs           Json?    // { whatsapp: true, email: false, reminderHours: [24, 2] } — §12 "preferências de comunicação"
lastCompletedAt      DateTime?  // desnormalizado pelo transition(COMPLETED); base da reativação (§28)
tags                 PatientTag[]
```
`emergencyContact*` é dado administrativo (para ligar), não clínico. Entra na anonimização LGPD (`anonymize.ts`).

### Service (§8)
```prisma
requiresDeposit      Boolean @default(false)
depositCents         Int?
cancellationHours    Int?      // sobrescreve ProfessionalPolicy quando preenchido
```
**⚑ DECISÃO D1** — hoje `Service` pertence a **um** profissional (`professionalId`). O §8 pede "profissionais habilitados" (N:N, serviço da clínica). Opções: (a) manter 1:N e a clínica "duplica" o serviço por profissional — zero migração, agenda e preços por profissional já funcionam; (b) `Service.organizationId` + `ServiceProfessional(serviceId, professionalId, priceCents?)` — mais fiel ao briefing, mexe em disponibilidade, página pública e recorrência. Recomendo **(a) no MVP**.

### Appointment
```prisma
packagePurchaseId    String?    // sessão coberta por pacote
depositCents         Int?       // sinal exigido
depositPaidAt        DateTime?
unitId               String?
surveySentAt         DateTime?
```

### Payment
`appointmentId` passa a **opcional** e nasce `packagePurchaseId String?` — uma linha de `Payment` paga uma sessão **ou** um pacote (check constraint no SQL da migração: exatamente um dos dois). Assim `/financeiro` "Recebido" continua sendo `sum(Payment.amountCents) where paidAt in mês`, sem segunda fonte.

### MembershipRole
`OWNER | PROFESSIONAL | RECEPTIONIST | FINANCE` — o §5 pede "Financeiro". `FINANCE` = `canViewAnyFinancials` + `/financeiro` + comissões; sem agenda de escrita, sem clínico. Ajuste em `permissions.ts` + `permissions.test.ts`.

## 3. Tabelas novas

### CRM — tags (§12, §32)
```prisma
model Tag        { id, organizationId, name, color, @@unique([organizationId, name]) }
model PatientTag { patientId, tagId, createdAt, @@id([patientId, tagId]) }
```

### Pacotes (§20)
```prisma
model Package {                       // catálogo
  id, organizationId, professionalId?   // null = pacote da clínica, vale para qualquer profissional
  name, description?, sessionsCount Int, priceCents Int, validityDays Int
  serviceIds String[]                   // vazio = qualquer serviço do profissional
  isActive Boolean, sortOrder Int, createdAt, updatedAt
  @@index([organizationId, isActive])
}
model PackagePurchase {               // venda a um paciente
  id, organizationId, patientId, packageId, professionalId
  nameSnapshot, sessionsTotal Int, priceCents Int
  purchasedAt DateTime, expiresAt DateTime, status PackageStatus  // ACTIVE | EXHAUSTED | EXPIRED | CANCELLED
  paymentStatus PaymentStatus, cancelledAt?, cancelReason?
  payments Payment[], consumptions PackageConsumption[]
  @@index([organizationId, patientId, status])
}
model PackageConsumption {
  id, packagePurchaseId, appointmentId @unique, consumedAt, revertedAt?, revertReason?
}
```
Saldo = `sessionsTotal − count(consumptions where revertedAt is null)` — **calculado, nunca coluna** (mesma regra do `Appointment.paymentStatus` como resumo do `Payment`).
**⚑ DECISÃO D2** — quando consumir: (a) só em `COMPLETED`; (b) também em `NO_SHOW` conforme `ProfessionalPolicy` (política de falta, §23); (c) reservar no `CONFIRMED` e liberar no cancelamento. Recomendo **(a) + (b) configurável**, consumo dentro do `transition()` de `appointment-status.ts` e reversão ao reabrir.

### Comissões (§25)
```prisma
model CommissionRule    { id, organizationId, professionalId, serviceId?, percentBp Int?, fixedCents Int?, basis CommissionBasis /* RECEIVED | COMPLETED */, validFrom @db.Date, validTo? }
model CommissionEntry   { id, organizationId, professionalId, appointmentId?, paymentId?, packagePurchaseId?, baseCents, amountCents, ruleId, occurredAt, closingId? }
model CommissionClosing { id, organizationId, professionalId, periodStart @db.Date, periodEnd @db.Date, totalCents, closedAt, closedByUserId, note? }
```
Entradas geradas no evento da base (pagamento recebido ou sessão concluída); fechamento imutável; ajuste pós-fechamento = linha negativa (mesmo desenho do Dental, sem contas a pagar).
**⚑ DECISÃO D3** — base padrão: sobre **recebido** (caixa) ou sobre **realizado** (sessões concluídas)? Recomendo recebido; pacote rateia por sessão consumida.

### Documentos administrativos e consentimentos (§15)
```prisma
model DocumentTemplate {
  id, organizationId, professionalId?    // null = da clínica
  kind DocumentKind                       // CONSENT | CONTRACT | POLICY | AUTHORIZATION | OTHER
  title, body String                      // markdown com variáveis {{paciente.nome}} {{profissional.nome}} {{servico}} {{valor}} {{data}}
  version Int, isActive, requireBeforeFirstSession Boolean, createdByUserId, createdAt, updatedAt
  @@unique([organizationId, title, version])
}
model DocumentRequest {                  // instância enviada a um paciente
  id, organizationId, patientId, templateId, templateVersion Int, professionalId
  bodySnapshot String                     // congelado no envio; o modelo pode mudar depois
  tokenHash String @unique, status DocumentStatus  // PENDING | VIEWED | ACCEPTED | EXPIRED | REVOKED
  sentAt, viewedAt?, acceptedAt?, expiresAt
  acceptName?, acceptIp?, acceptUserAgent?, acceptanceHash?  // sha256(bodyHash|nome|instante|ip) — mesma técnica do Dental
  pdfKey?                                 // R2, gerado no aceite
  appointmentId?                          // opcional: exigido para esta sessão
  @@index([organizationId, patientId, status])
}
```
Aceite por clique = "assinatura eletrônica simples". Assinatura qualificada (ICP/provedor) é Fase 2 e entra como `signatureProvider`/`signatureRef` nesta mesma tabela. **Não é clínico**: guarda o que o paciente aceitou, não o que disse.

O `FormTemplate` com `dataClass=ADMINISTRATIVE` que já existe cobre "termo online" hoje; a migração move esses modelos para `DocumentTemplate` e `FormTemplate` fica só para questionários.

### Portal do paciente (§17)
```prisma
model PatientAccessToken { id, organizationId, patientId, tokenHash @unique, purpose PORTAL_LOGIN, expiresAt, usedAt?, createdAt, requestIp? }
model PatientSession     { id, organizationId, patientId, sid @unique, expiresAt, lastSeenAt, userAgent?, revokedAt? }
```
**⚑ DECISÃO D4** — autenticação do paciente: (a) **link mágico por WhatsApp** (prova posse do número, que já é a identidade `(organizationId, whatsapp)`; sem senha para guardar); (b) e-mail + senha. Recomendo (a); (b) só se o Notify não estiver em produção no lançamento.

### Pesquisa de experiência (§29) e reativação (§28)
```prisma
model ExperienceSurvey    { id, organizationId, appointmentId @unique, patientId, tokenHash @unique, score Int?, comment String?, sentAt, answeredAt?, expiresAt }
model ReactivationContact { id, organizationId, patientId, professionalId, notificationId?, sentAt, byUserId, outcome? /* BOOKED | NO_REPLY | OPTED_OUT */ }
```
Reativação **não** é tabela de candidatos: é uma consulta (`lastCompletedAt < now − N dias AND followUpStatus = ACTIVE AND sem agendamento futuro`) + o registro do contato feito, sempre por clique humano (mesma filosofia da lista de espera: "nada é oferecido automaticamente").

### Unidade (§31 — só a tabela, sem tela) — **criada em 20/09/2026** (`20260920203516_unit_prep`)
```prisma
model Unit { id, organizationId, name, addressLine?, addressCity?, addressState?, isActive, createdAt, updatedAt, @@unique([organizationId, name]) }
// Professional.unitId? e Appointment.unitId? (FK SetNull) — nulos; nenhuma tela lê ou escreve.
```
Quando a Fase 2 chegar: presencial herda `unit` do profissional; online fica nula; filtros de agenda/relatório por unidade; nunca uma unidade de outra `organizationId` (índice e checagem em `check:tenant`).

## 4. Índices

Regra: **todo índice começa por `organizationId`** (ou por uma FK que já é do tenant). Novos:

| Tabela | Índice | Consulta |
|---|---|---|
| Appointment | `(organizationId, professionalId, startsAt)` (existe) · `(packagePurchaseId)` | agenda; saldo do pacote |
| Patient | `(organizationId, lastCompletedAt)` · `(organizationId, followUpStatus)` | reativação; "clientes inativos" do dashboard |
| Payment | `(packagePurchaseId)` · `(appointmentId)` · `(paidAt)` | financeiro por mês |
| PackagePurchase | `(organizationId, patientId, status)` · `(expiresAt)` | ficha; cron de expiração |
| DocumentRequest | `(organizationId, patientId, status)` · `tokenHash` unique | ficha; link público |
| CommissionEntry | `(organizationId, professionalId, occurredAt)` · `(closingId)` | apuração |
| PatientAccessToken / PatientSession | `tokenHash` / `sid` unique + `(expiresAt)` | login; limpeza no cron |
| ExperienceSurvey | `tokenHash` unique · `(organizationId, answeredAt)` | link; média no dashboard |

## 5. Isolamento por tenant

Hoje: **na aplicação** — `src/lib/tenant.ts` + regra "toda query filtra por `actor.organizationId`", e ids vindos do cliente sempre re-verificados. Não há RLS no Postgres.

Proposta (em ordem de custo):
1. **Manter** o modelo atual e cobrir as tabelas novas com o mesmo padrão (helpers `forTenant`).
2. **Teste de guarda** (novo, `tests/tenant-isolation.test.ts`): para cada `model` com `organizationId`, garantir que todo `findMany/findFirst/update/delete` em `src/lib/**` passe por um helper que injeta o tenant (lint por AST ou grep estruturado no CI).
3. **Fase 2, opcional**: RLS com `SET LOCAL app.tenant_id` por transação (o Vendas usa triggers; o Psico pode usar RLS). Só compensa quando houver acesso ao banco fora do app (BI, IA).

Rotas públicas (`agendar`, `confirmar`, `sessao`, `formulario`, `documento`, `portal`, `pesquisa`) resolvem o tenant **pelo slug ou pelo token**, nunca por parâmetro de id; `select` exaustivo, sem `include` (regra já escrita no CLAUDE.md do Psico).

## 6. Migração do Psico → Mind (dados)

Não há cliente real no Psico em produção (não está no Coolify nem no catálogo — `infra/README.md`). Logo: migrações Prisma normais, sem script de dados, exceto `crp → registrationNumber` e `FormTemplate(ADMINISTRATIVE) → DocumentTemplate`, ambos idempotentes e cobertos pelo seed.
