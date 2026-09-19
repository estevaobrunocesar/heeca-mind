/**
 * Delegação de acesso clínico — regras puras (sem banco).
 *
 * Quem delega é sempre o profissional responsável, para outro profissional
 * da mesma organização, por prazo determinado e com motivo. Dois usos:
 *
 *  - SUPERVISION: supervisor lê o prontuário; não escreve.
 *  - SUBSTITUTION: substituto (férias, licença) lê e registra evoluções no
 *    prontuário do titular, assinando como autor.
 *
 * O que uma delegação NÃO faz: não transfere o paciente, não dá acesso a
 * dono/recepção, não sobrevive à revogação nem ao prazo.
 */

export type DelegationKind = "SUPERVISION" | "SUBSTITUTION";

export const MAX_DELEGATION_DAYS = 90;

export const DELEGATION_KIND_LABEL: Record<DelegationKind, string> = {
  SUPERVISION: "Supervisão (somente leitura)",
  SUBSTITUTION: "Substituição (leitura e registro)",
};

/** Escrita é consequência do tipo, não uma opção separada — evita "supervisão que escreve". */
export function delegationCanWrite(kind: DelegationKind): boolean {
  return kind === "SUBSTITUTION";
}

export type DelegationWindow = { startsAt: Date; expiresAt: Date; revokedAt: Date | null };

export function isDelegationActive(d: DelegationWindow, now = new Date()): boolean {
  if (d.revokedAt) return false;
  return d.startsAt.getTime() <= now.getTime() && now.getTime() < d.expiresAt.getTime();
}

/**
 * Valida o período: começa hoje ou depois (nunca retroativo — não se
 * "legaliza" um acesso passado), termina depois de começar, no máximo 90 dias.
 */
export function validateDelegationWindow(startsAt: Date, expiresAt: Date, now = new Date()): string | null {
  const dayMs = 86_400_000;
  if (startsAt.getTime() < now.getTime() - dayMs) return "O início não pode ser no passado";
  if (expiresAt.getTime() <= startsAt.getTime()) return "O fim precisa ser depois do início";
  if (expiresAt.getTime() - startsAt.getTime() > MAX_DELEGATION_DAYS * dayMs) return `Prazo máximo de ${MAX_DELEGATION_DAYS} dias — renove se precisar`;
  return null;
}

/**
 * Um "escopo" é um prontuário que o ator pode ver: o próprio (delegationId
 * null) ou o de um colega, via delegação.
 */
export type ClinicalScope = {
  professionalId: string;
  canWrite: boolean;
  delegationId: string | null;
  /** Só em escopos delegados: para a UI explicar de quem é o prontuário. */
  grantorName?: string;
  kind?: DelegationKind;
  expiresAt?: Date;
};

/** Onde uma nova nota/documento vai parar: o próprio prontuário tem prioridade; depois, a primeira substituição. */
export function pickWriteScope(scopes: ClinicalScope[]): ClinicalScope | null {
  return scopes.find((s) => s.delegationId === null && s.canWrite) ?? scopes.find((s) => s.canWrite) ?? null;
}

/**
 * Pode excluir uma nota? O titular exclui qualquer nota do seu prontuário;
 * o delegado só as que ele mesmo escreveu (e enquanto a delegação valer).
 */
export function canDeleteClinicalEntry(scopes: ClinicalScope[], entry: { professionalId: string; authorUserId: string }, actorUserId: string): boolean {
  const scope = scopes.find((s) => s.professionalId === entry.professionalId);
  if (!scope) return false;
  if (scope.delegationId === null) return true;
  return scope.canWrite && entry.authorUserId === actorUserId;
}
