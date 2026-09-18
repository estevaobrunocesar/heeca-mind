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
  /** id do Professional vinculado ao usuário, se houver */
  professionalId: string | null;
};

// ──────────────────────────────────────────────────────────────
// Dados administrativos (agenda, pacientes, serviços, financeiro)
// ──────────────────────────────────────────────────────────────

/** Pode gerenciar a agenda (confirmar, cancelar, reagendar) de um profissional? */
export function canManageSchedule(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER") return true;
  if (actor.role === "RECEPTIONIST") return true;
  return actor.professionalId === professionalId;
}

/** Pode editar o perfil público, serviços e configurações de um profissional? */
export function canEditProfessional(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER") return true;
  return actor.professionalId === professionalId;
}

/** Pode ver dados financeiros (valores, pagamentos, faturamento)? */
export function canViewFinancials(actor: Actor, professionalId: string): boolean {
  if (actor.role === "OWNER") return true;
  return actor.professionalId === professionalId;
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
 * Esta é a regra mais sensível do sistema. Ela define quem, dentro de uma
 * clínica, enxerga conteúdo terapêutico. Considere:
 *
 *  - Sigilo profissional (Código de Ética do Psicólogo, art. 9): o conteúdo
 *    clínico pertence à relação psicólogo–paciente, não à clínica.
 *  - O OWNER de uma clínica pode ser um administrador que NÃO é psicólogo.
 *    Ele deve ver anotações clínicas? E se ele também for psicólogo, mas de
 *    outro paciente?
 *  - RECEPTIONIST nunca deve ter acesso — isso é consenso.
 *  - Supervisão clínica / substituição de profissional (férias, desligamento)
 *    são casos reais, mas provavelmente exigem um mecanismo explícito de
 *    delegação, não uma regra implícita por papel.
 *
 * Toda leitura permitida por esta função gera um ClinicalAccessLog.
 *
 * TODO(você): implemente a regra. A assinatura já está pronta.
 */
export function canAccessClinicalData(actor: Actor, treatingProfessionalId: string): boolean {
  // Implemente aqui. Sugestão de ponto de partida (mais restritivo possível):
  //   return actor.professionalId !== null && actor.professionalId === treatingProfessionalId;
  //
  // Decida se OWNER-psicólogo tem alguma exceção, e documente o porquê num
  // comentário — essa decisão será citada na política de privacidade.
  void actor;
  void treatingProfessionalId;
  throw new Error("canAccessClinicalData: regra ainda não definida");
}
