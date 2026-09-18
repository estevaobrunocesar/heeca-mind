# Solicitação de Desenvolvimento — Sistema de Gestão, Agenda e Atendimento para Psicólogos

## 1. Objetivo do Sistema

Desenvolver uma plataforma de gestão e agendamento para psicólogos e profissionais de psicologia, permitindo que o profissional organize sua agenda, cadastre modalidades de atendimento, disponibilize horários para agendamento online e mantenha comunicação automatizada com seus pacientes.

O sistema deverá permitir agendamentos presenciais e online, confirmação via WhatsApp, lembretes automáticos, controle de sessões e gestão básica dos pacientes.

O foco inicial será facilitar a rotina administrativa do psicólogo, reduzir faltas e oferecer uma experiência profissional, segura e organizada ao paciente.

## 2. Público-Alvo

- Psicólogos autônomos; consultórios; clínicas de psicologia (inclusive com múltiplos psicólogos);
- Atendimento online e presencial; terapia individual, casais, famílias.

## 3. Funcionalidades do Psicólogo

### 3.1 Cadastro do Profissional

Nome profissional; nome completo; CRP; foto; descrição da atuação; abordagens; especialidades; telefone/WhatsApp; e-mail profissional; endereço do consultório; cidade; Instagram/site; modalidades; horário de funcionamento; link personalizado (`app.com.br/agendar/psicologo-nome`).

CRP é dado profissional com acesso controlado quando necessário.

## 4. Modalidades e Serviços

Cada serviço: nome, descrição, duração, valor, modalidade (presencial/online/híbrida), status ativo/inativo, orientações ao paciente.

Exemplos: psicoterapia individual, atendimento online, presencial, terapia de casal, infantil, avaliação psicológica, orientação profissional, acompanhamento, entrevista inicial, retorno.

## 5. Configuração da Agenda

Dias de atendimento; horário inicial/final; intervalos; folgas; férias; bloqueios; horários excepcionais; duração padrão; antecedência mínima; política de cancelamento; prazo mínimo para reagendamento; limite de sessões/dia. Impedir conflitos automaticamente.

## 6. Experiência do Paciente

Acessa link público → vê modalidades → escolhe sessão → vê duração/valor → escolhe presencial/online → data → horário → dados (nome, WhatsApp, e-mail, preferência, observação opcional) → confirma → recebe confirmação via WhatsApp.

**O formulário público não deve solicitar diagnóstico, histórico clínico ou informações terapêuticas.**

## 7. Fluxo de Agendamento

Status: Pendente; Aguardando confirmação; Confirmado; Cancelado pelo paciente; Cancelado pelo profissional; Reagendamento solicitado; Concluído; Não compareceu; Aguardando pagamento.

```
Paciente solicita → Sistema registra → WhatsApp envia → Paciente confirma → CONFIRMADO → Psicólogo vê na agenda
```

## 8. Integração com WhatsApp

Comunicação administrativa. Mensagens: solicitação de agendamento (com botão confirmar), confirmação, lembrete, link da sessão online, cancelamento. API oficial ou provedor compatível com WhatsApp Business.

## 9. Painel do Psicólogo

Sessões do dia; próxima sessão; total de pacientes; confirmadas; pendentes; cancelamentos; reagendamentos; online vs presencial; faturamento estimado; taxa de comparecimento.

## 10. Agenda Visual

Diária/semanal/mensal. Cada agendamento: paciente, tipo, modalidade, horário, duração, status, WhatsApp, observações administrativas. Ações: confirmar, cancelar, reagendar, concluir, não compareceu, observação, contato, link online. **Sem informações clínicas na agenda.**

## 11. Cadastro de Pacientes

Administrativo: nome, WhatsApp, e-mail, primeiro agendamento, histórico, modalidade habitual, último/próximo atendimento, status, observações administrativas (ex.: prefere online, melhor horário, semanal, precisa de recibo, forma de pagamento).

**Informações clínicas em módulo separado, com controle de acesso e proteção reforçada.**

## 12. Sessões Recorrentes

Semanal/quinzenal; data inicial/final; gerar futuras; editar uma ou toda a série; cancelar uma ou a recorrência.

## 13. Página Pública de Agendamento

Profissional, discreta, acolhedora, responsiva. Foto, nome, CRP, descrição, abordagens, especialidades, modalidades, serviços, valores (opcional), calendário, horários, política de cancelamento, botão de agendamento, WhatsApp.

## 14. Atendimento Online

Plataforma; link fixo ou por sessão; envio automático; lembrete com acesso. Futuro: Meet, Zoom, Teams, própria.

## 15. Políticas de Atendimento

Cancelamento, prazo mínimo, faltas, tolerância de atraso, reagendamento, orientações online, pagamento, confirmação, termos.

## 16. Controle Financeiro Básico

Valor; pago/pendente; forma (Pix, dinheiro, cartão, transferência, particular, convênio); faturamento estimado; histórico. Sem emissão fiscal no MVP.

## 17. Recibos e Documentos (futuro)

Recibos, comprovantes, exportação, integração contábil.

## 18. Privacidade e Segurança

LGPD; controle de acesso; isolamento por profissional/clínica; criptografia de sensíveis; logs de acesso e alteração; backup; controle de sessão; MFA; **sem dados clínicos em notificações/WhatsApp**; separação admin/clínico; retenção e exclusão.

## 19. Módulos do MVP

1. Autenticação · 2. Configuração do consultório · 3. Serviços · 4. Agenda · 5. Pacientes · 6. Agendamento público · 7. WhatsApp · 8. Dashboard · 9. Financeiro básico

## 20. Requisitos Técnicos

SaaS multi-tenant; isolamento; banco relacional; API organizada; permissões; auditoria; webhook WhatsApp; notificações; responsivo; público mobile-first; preparado para clínicas; dados sensíveis; separação admin/clínico; LGPD.

## 21. Funcionalidades Futuras

Prontuário eletrônico; evolução clínica; anotações privadas; documentos clínicos; assinatura digital; teleatendimento; pagamento recorrente; convênios; recibos; relatórios; gestão de clínicas; múltiplos profissionais; secretária; salas; lista de espera; formulários pré-atendimento; consentimento; questionários; vídeo; automação de retorno; CRM.

## 22. Resultado Esperado

**Agenda organizada + Agendamento online + WhatsApp + Sessões recorrentes + Privacidade.**
