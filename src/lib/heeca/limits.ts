import { planLimit } from "./core";

/**
 * Limite de profissionais do plano (entitlement `plan.limits.maxProfessionals`).
 *
 * O portal é dono do plano; aqui só espelhamos `planLimits` (Json) e aplicamos.
 * `limits` é jsonb livre: ausente, string, zero ou negativo significam
 * **sem limite** — nunca limite zero, que trancaria a conta inteira.
 *
 * Só profissionais ATIVOS ocupam vaga: desativar alguém libera uma.
 */
export function maxProfessionalsFrom(limits: unknown): number | null {
  return planLimit(limits, "maxProfessionals");
}

/**
 * Cabe mais um profissional ativo?
 *
 * O teste é `typeof max !== "number"`, não `max === null`: a coluna pode chegar
 * como `undefined` (cliente Prisma em memória antes de uma migração, payload
 * parcial) e um guard por `null` deixaria esse caso cair no ramo do bloqueio —
 * recusando justamente quem não tem limite nenhum.
 */
export function canAddProfessional(max: number | null | undefined, activeCount: number): boolean {
  return typeof max !== "number" || activeCount < max;
}

/**
 * Mensagem de recusa: diz o que fazer, não só que não pode.
 *
 * "Remover da equipe" é o texto do botão real (removeMemberAction) — que é também o único
 * caminho no Mind que libera uma vaga, porque desliga o perfil. Não prometa "desativar":
 * não existe essa ação na tela.
 */
export function seatsFullMessage(max: number): string {
  const vagas = max === 1 ? "1 profissional" : `${max} profissionais`;
  return `Seu plano inclui ${vagas}. Para incluir mais alguém, remova um profissional da equipe em Configurações › Equipe ou mude de plano na sua conta Heeca.`;
}
