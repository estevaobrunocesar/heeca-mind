import "server-only";
import { db } from "./db";
import type { Actor } from "./permissions";

/**
 * Isolamento de tenant.
 *
 * Toda leitura/escrita de entidade que pertence a uma Organization deve passar
 * por aqui ou incluir `organizationId: actor.organizationId` explicitamente.
 * Estes helpers existem para que o caminho fácil seja também o caminho seguro.
 *
 * Nota: Postgres Row-Level Security (RLS) seria uma segunda camada de defesa.
 * Ficou fora do MVP porque o Prisma exige `SET app.tenant_id` por transação —
 * viável, mas com custo de complexidade. Reavaliar quando houver clínicas.
 */

/** Garante que um Professional pertence ao tenant do ator. Lança se não. */
export async function assertProfessionalInTenant(actor: Actor, professionalId: string) {
  const found = await db.professional.findFirst({
    where: { id: professionalId, organizationId: actor.organizationId },
    select: { id: true },
  });
  if (!found) throw new TenantViolation("professional", professionalId);
  return found;
}

/** Garante que um Patient pertence ao tenant do ator. Lança se não. */
export async function assertPatientInTenant(actor: Actor, patientId: string) {
  const found = await db.patient.findFirst({
    where: { id: patientId, organizationId: actor.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!found) throw new TenantViolation("patient", patientId);
  return found;
}

/** Garante que um Appointment pertence ao tenant do ator. Retorna o registro. */
export async function getAppointmentInTenant(actor: Actor, appointmentId: string) {
  const found = await db.appointment.findFirst({
    where: { id: appointmentId, organizationId: actor.organizationId },
  });
  if (!found) throw new TenantViolation("appointment", appointmentId);
  return found;
}

/**
 * Erro lançado quando um ator tenta acessar recurso de outro tenant.
 * Deliberadamente indistinguível de "não encontrado" para o cliente.
 */
export class TenantViolation extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} não encontrado`);
    this.name = "TenantViolation";
  }
}
