# 05 — Segurança

## 1. Perfis (§5) × papéis reais

| Briefing | `MembershipRole` | Agenda | Pacientes (CRM) | Valores | Config/equipe | Clínico |
|---|---|---|---|---|---|---|
| Administrador | `OWNER` (existe) | todos | todos | todos | sim | **só se for o profissional responsável** (dono sem perfil clínico não vê nada — regra de 2026-09-19) |
| Profissional | `PROFESSIONAL` (existe) | só a própria | os que atende | os próprios | o próprio perfil | os próprios + delegações recebidas |
| Recepção | `RECEPTIONIST` (existe) | qualquer profissional | todos | **nunca** | não | **nunca** |
| Financeiro | `FINANCE` (**novo**) | leitura | leitura | todos + comissões | não | **nunca** |
| Cliente/Paciente | não é `Membership` — `PatientSession` (**novo**) | as próprias sessões | os próprios dados | os próprios pagamentos | não | **nunca** |

Tudo em `src/lib/permissions.ts` (puro) + `permissions.test.ts`. Regra de ouro mantida: **`activeProfessionalId` (seletor) muda o que a tela mostra; `professionalId` (quem sou) decide o que posso** — e o seletor **nunca** transfere acesso clínico.

Proibições do §37 mapeadas:
- "profissional não vê dados de outro" → `canManageSchedule(actor, professionalId)` compara com o próprio; OWNER/RECEPTIONIST veem agenda de todos, mas clínico não.
- "recepção não acessa clínico" → `canAccessClinicalData` exige PROFESSIONAL/OWNER **com perfil** e ser o responsável.
- "tenant não acessa outro" → `tenant.ts` + rotas públicas por slug/token + `tenantId` do callback do Notify conferido.

## 2. Autenticação e sessão

| Requisito (§14, §37) | Estado | Observação |
|---|---|---|
| MFA | existe — TOTP RFC 6238, códigos de recuperação, segredo cifrado | SSO do portal **não pula** o MFA: `requireActor()` repete a checagem de `mfaPending` |
| Gestão/expiração de sessão | existe — `user_sessions` por login, `assertActive(sid)` a cada request, revogação manual e automática | SSO cria linha igual ao login local |
| Rate limiting | existe — janela fixa no Postgres | novos baldes: `portal:phone`, `portal:ip`, `document:token`, `survey:token`, `sso:jti` |
| HTTPS | produção exige `https` em `env.ts`; headers em `next.config.ts` | Traefik/Coolify termina TLS |
| Proteção horizontal (IDOR) | ids por `action.bind`, posse re-verificada no servidor | manter nos módulos novos |
| Senhas | Auth.js Credentials + hash | usuário criado por SSO nasce **sem senha** (`passwordHash null`); define pelo "recuperar senha" se quiser login local |
| Sessão do paciente | novo | cookie próprio `hm_patient` (HttpOnly, Secure, SameSite=Lax), 30 d, `PatientSession` revogável pela recepção; **não** é sessão do Auth.js |

## 3. Dados clínicos (§13, §14, §35) — nada muda, tudo se preserva

- Cifra AES-256-GCM em `ClinicalNote.contentEnc`, `ClinicalDocument` (blob + título + nome), `FormRequest.answersEnc`; envelope com `keyId`; rotação por `npm run rotate-key`.
- Acesso só via `src/lib/clinical.ts` → `clinicalScopes()` → `ClinicalAccessLog` (READ/WRITE/DELETE/EXPORT, com `delegationId`).
- Delegação (supervisão/substituição) com prazo ≤ 90 d, revogável, auditada em metadados.
- Menu **"Clínico" separado** (§39) só para `canOpenClinicalRecord`.
- **Checklist para qualquer campo clínico futuro** (Fase 2): cifrar → adicionar em `rotateAllKeys` → cobrir em `anonymize.ts` → logar em `ClinicalAccessLog` → nunca em `audit()`, `Notification.payload`, e-mail, CSV, IA.
- Verificação operacional que já existe e vira teste de release: `pg_dump | grep <palavra da nota>` = 0.

## 4. Auditoria (§36)

| Evento | Onde | Estado |
|---|---|---|
| Login / logout / MFA / revogação | `audit("auth.*")` + `user_sessions` | existe |
| Criação / alteração / exclusão de entidade administrativa | `audit("entidade.verbo", before/after)` | existe; estender a pacotes, comissões, documentos, tags, org |
| Visualização de dado restrito | `ClinicalAccessLog` (clínico) · `AccessLog` (páginas) | existe |
| Download / compartilhamento | `ClinicalAccessLog EXPORT`, `audit("patient.export")`, novo `audit("document.pdf_download")`, `audit("commission.export")` | parcial → completar |
| Alteração de permissões | `audit("membership.*")`, `clinical_delegation.grant/revoke` | existe |
| Provisionamento / entitlement / SSO | `audit("heeca.provision|entitlement|sso")` com `subscriptionId`, sem segredo | novo |
| Aceite de documento pelo paciente | `DocumentRequest` (ip, ua, hash) + `audit("document.accept")` | novo |

Proteção do log: `audit_logs` só recebe `INSERT` pela aplicação (sem action de update/delete); em produção, criar role do banco sem `UPDATE/DELETE` nessa tabela para o usuário do app (migração SQL) e manter backup diário. A anonimização LGPD é a única exceção (limpa `before/after` de pacientes anonimizados) e é auditada.

## 5. LGPD (§14)

- Base legal por finalidade: execução de contrato (agenda, pagamento), consentimento (WhatsApp/e-mail — `commsPrefs`, opt-out global do Notify), obrigação legal (guarda de prontuário CFP 001/2009 → `retentionYears ≥ 5`).
- Direitos do titular: exportação JSON (existe), exclusão lógica + anonimização (existe), correção pelo portal (novo, campos limitados).
- Retenção: prontuário e financeiro seguem `retentionYears`; `PatientSession/AccessToken` 30 d; `WhatsAppWebhookEvent` 90 d (existe); `ExperienceSurvey` segue o paciente.
- Encarregado/política: texto no portal (C7 do `PENDENCIAS.md` — revisão jurídica pendente, tarefa da plataforma).

## 6. Proteção de arquivos (§37)

- Foto do profissional: pública, magic bytes + 1,5 MB, SVG recusado (existe).
- Documentos clínicos: cifrados antes do upload, entregues por route handler com `no-store` + `CSP: sandbox` (existe).
- PDF de documento administrativo aceito: **privado** (`putPrivate`), entregue por `GET /pacientes/[id]/documentos/[reqId]/pdf` (sessão do profissional) ou `GET /portal/documentos/[reqId]/pdf` (sessão do paciente dono), `Content-Disposition: attachment`, auditado. Não precisa cifrar (não é clínico), mas nunca ganha URL pública.
- Logo da clínica: pública, mesma validação da foto.

## 7. Segredos e ambiente

`src/lib/env.ts` passa a exigir em produção: `HEECA_PLATFORM_SECRET` (≥ 32), `HEECA_PORTAL_URL` https, `WHATSAPP_PROVIDER ∈ {notify, console}` e, se `notify`, `NOTIFY_URL` + `NOTIFY_SECRET` (≥ 32) + `NOTIFY_PRODUCT=mind`; `STORAGE_DRIVER=s3` com `S3_*`. Nenhum segredo em log ou em `audit.after`. Rotação: `NOTIFY_SECRET` e `HEECA_PLATFORM_SECRET` trocam em par com o portal/Notify (o `coolify-setup.mjs apply` faz isso — plataforma).

## 8. Backup e recuperação

Padrão da plataforma: Postgres diário 03:00 UTC → R2 `heeca-backups`, 7 cópias + 1 local; restore pelo Coolify ou `pg_restore`. **Específico do Mind**: `ENCRYPTION_KEY` fora do backup do banco (está no env do Coolify e em `production.env`) — sem ela o backup do prontuário é inútil; registrar no `docs/DEPLOY.md` §"perda de chave" e testar restore + leitura de uma nota cifrada a cada rotação de chave.
