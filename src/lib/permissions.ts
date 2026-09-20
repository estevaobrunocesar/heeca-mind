import type { MembershipRole } from "@/generated/prisma/enums";

/**
 * Regras de autorização.
 *
 * Todas as verificações recebem um `Actor` (quem está agindo) já resolvido
 * a partir da sessão — ver src/lib/session.ts. Nenhuma função aqui acessa o
 * banco: são funções puras, fáceis de testar e de auditar.
 */

export type Actor = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  /** id do Professional vinculado ao usuário, se houver ("quem eu sou") */
  professionalId: string | null;
  /**
   * Profissional cujas agenda/serviços/configurações estão sendo vistas
   * ("de quem estou cuidando"). Para PROFESSIONAL é sempre o próprio; para
   * OWNER/RECEPTIONIST vem do seletor no cabeçalho. null = organização sem
   * profissionais.
   */
  activeProfessionalId: string | null;
};

// ──────────────────────────────────────────────────────────────
// Dados administrativos (agenda, pacientes, serviços, financeiro)
// ──────────────────────────────────────────────────────────────

/** Pode gerenciar a agenda (confirmar, cancelar, reagendar) de um profissional? */
export function canManageSchedule(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.role === "RECEPTIONIST") return true;
  if (actor.role === "FINANCE") return false; // agenda só leitura
  return actor.professionalId === professionalId;
}

/** Pode criar/editar o cadastro administrativo de pacientes? Financeiro só consulta. */
export function canManagePatients(actor: Actor): boolean {
  return actor.role !== "FINANCE";
}

/** Pode editar o perfil público, serviços e configurações de um profissional? */
export function canEditProfessional(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER") return true;
  return actor.professionalId === professionalId;
}

/** Pode ver dados financeiros (valores, pagamentos, faturamento)? */
export function canViewFinancials(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER" || actor.role === "FINANCE") return true;
  return actor.professionalId === professionalId;
}

/** Vê valores em telas que cruzam profissionais (ficha do paciente, menu)? Recepção nunca. */
export function canViewAnyFinancials(actor: Actor): boolean {
  return actor.role !== "RECEPTIONIST";
}

/** Pode excluir (logicamente) um paciente? Recepção não — é decisão do profissional. */
export function canDeletePatient(actor: Actor): boolean {
  return actor.role === "OWNER" || actor.role === "PROFESSIONAL";
}

/** Pode gerenciar membros da organização (convidar, remover, alterar papel)? */
export function canManageMembers(actor: Actor): boolean {
  return actor.role === "OWNER";
}

// ──────────────────────────────────────────────────────────────
// Dados clínicos (anotações, evolução, prontuário)
// ──────────────────────────────────────────────────────────────

/**
 * Pode ler/escrever as anotações clínicas de um paciente atendido por
 * `treatingProfessionalId`?
 *
 * REGRA ADOTADA (2026-09-19): só o profissional responsável — o usuário
 * precisa ter perfil profissional e ele precisa ser exatamente o que atende.
 *
 * Por quê:
 *  - Código de Ética do Psicólogo (CFP), art. 9: o sigilo protege a relação
 *    psicólogo–paciente. A clínica é a instituição; não é parte da relação.
 *  - O OWNER de uma clínica pode ser um administrador sem CRP. Mesmo sendo
 *    psicólogo, ele só vê os SEUS pacientes.
 *  - RECEPTIONIST nunca.
 *  - Supervisão e substituição em férias são casos reais, mas exigem um
 *    ato explícito e auditado do titular: ClinicalDelegation, com prazo e
 *    motivo (src/lib/clinical-delegation.ts). Esta função continua sendo o
 *    portão do PRÓPRIO prontuário; a delegação é resolvida em
 *    clinicalScopes (src/lib/clinical.ts) e nunca por papel.
 *
 * Toda leitura permitida gera um ClinicalAccessLog (src/lib/clinical.ts).
 */
export function canAccessClinicalData(actor: Actor, treatingProfessionalId: string): boolean {
  if (actor.role === "RECEPTIONIST" || actor.role === "FINANCE") return false;
  return actor.professionalId !== null && actor.professionalId === treatingProfessionalId;
}
