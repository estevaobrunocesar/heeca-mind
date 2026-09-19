"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { invalid, type FormState } from "@/lib/form";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { serviceSchema } from "@/lib/validation/service";

export type ServiceFormState = FormState;

/**
 * Resolve o profissional dono dos serviços para o ator atual e verifica
 * permissão. Hoje: sempre o próprio perfil do ator. Quando entrar suporte a
 * clínicas, este é o único ponto a receber um `professionalId` explícito.
 */
async function resolveProfessional() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) throw new Error("Usuário sem perfil profissional");
  if (!canEditProfessional(actor, actor.activeProfessionalId)) throw new Error("Sem permissão");
  return { actor, professionalId: actor.activeProfessionalId };
}

/** Carrega um serviço garantindo que pertence ao profissional do ator. */
async function getOwnedService(professionalId: string, serviceId: string) {
  const service = await db.service.findFirst({ where: { id: serviceId, professionalId } });
  if (!service) throw new Error("Serviço não encontrado");
  return service;
}

export async function createServiceAction(
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { actor, professionalId } = await resolveProfessional();
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { price, ...data } = parsed.data;

  // Novo serviço entra no fim da lista.
  const last = await db.service.findFirst({
    where: { professionalId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const service = await db.service.create({
    data: { ...data, priceCents: price, professionalId, sortOrder: (last?.sortOrder ?? 0) + 1 },
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "service.create",
    entityType: "Service",
    entityId: service.id,
    after: service,
  });

  revalidatePath("/servicos");
  redirect("/servicos");
}

export async function updateServiceAction(
  serviceId: string,
  _prev: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const { actor, professionalId } = await resolveProfessional();
  const before = await getOwnedService(professionalId, serviceId);

  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { price, ...data } = parsed.data;

  const after = await db.service.update({
    where: { id: serviceId },
    data: { ...data, priceCents: price },
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "service.update",
    entityType: "Service",
    entityId: serviceId,
    before,
    after,
  });

  revalidatePath("/servicos");
  redirect("/servicos");
}

export async function toggleServiceAction(serviceId: string) {
  const { actor, professionalId } = await resolveProfessional();
  const before = await getOwnedService(professionalId, serviceId);

  const after = await db.service.update({
    where: { id: serviceId },
    data: { isActive: !before.isActive },
  });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: after.isActive ? "service.activate" : "service.deactivate",
    entityType: "Service",
    entityId: serviceId,
    before: { isActive: before.isActive },
    after: { isActive: after.isActive },
  });

  revalidatePath("/servicos");
}

/**
 * Exclusão só é permitida sem agendamentos vinculados. Com histórico, o
 * caminho é desativar — Appointment guarda snapshot do nome/preço, mas a FK
 * para Service continua sendo a fonte da verdade para relatórios.
 */
export async function deleteServiceAction(serviceId: string): Promise<{ error?: string }> {
  const { actor, professionalId } = await resolveProfessional();
  const before = await getOwnedService(professionalId, serviceId);

  const inUse = await db.appointment.count({ where: { serviceId } });
  if (inUse > 0) {
    return {
      error: `Este serviço tem ${inUse} agendamento(s) vinculado(s). Desative-o em vez de excluir.`,
    };
  }

  await db.service.delete({ where: { id: serviceId } });

  await audit(actor, {
    organizationId: actor.organizationId,
    action: "service.delete",
    entityType: "Service",
    entityId: serviceId,
    before,
  });

  revalidatePath("/servicos");
  return {};
}

/** Move o serviço uma posição para cima ou para baixo na lista pública. */
export async function moveServiceAction(serviceId: string, direction: "up" | "down") {
  const { professionalId } = await resolveProfessional();
  const all = await db.service.findMany({
    where: { professionalId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const idx = all.findIndex((s) => s.id === serviceId);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= all.length) return;

  // Renumera toda a lista: elimina empates de sortOrder herdados do seed.
  const reordered = [...all];
  [reordered[idx], reordered[swapWith]] = [reordered[swapWith], reordered[idx]];
  await db.$transaction(
    reordered.map((s, i) => db.service.update({ where: { id: s.id }, data: { sortOrder: i + 1 } })),
  );

  revalidatePath("/servicos");
}
