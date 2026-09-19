"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form";
import { canManageSchedule } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { dateTimeInTz } from "@/lib/time";
import { joinWaitlist, offerSlot, removeFromWaitlist, setWaitlistPriority, WaitlistError } from "@/lib/waitlist";
import { parsePrefs } from "@/lib/waitlist-match";
import { manualWaitlistSchema, offerSlotSchema, removeWaitlistSchema } from "@/lib/validation/waitlist";
import { audit } from "@/lib/audit";

async function entryInTenant(entryId: string) {
  const actor = await requireActor();
  const e = await db.waitlistEntry.findFirst({ where: { id: entryId, organizationId: actor.organizationId }, select: { id: true, professionalId: true } });
  if (!e || !canManageSchedule(actor, e.professionalId)) throw new Error("Sem permissão");
  return { actor, entry: e };
}

function withArrays(formData: FormData) {
  return { ...Object.fromEntries(formData), weekdays: formData.getAll("weekdays").map(String), periods: formData.getAll("periods").map(String) };
}

export async function addToWaitlistAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId || !canManageSchedule(actor, professionalId)) return { error: "Escolha um profissional no seletor do cabeçalho." };
  const parsed = manualWaitlistSchema.safeParse(withArrays(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  const patient = await db.patient.findFirst({ where: { id: d.patientId, organizationId: actor.organizationId, deletedAt: null }, select: { id: true } });
  if (!patient) return { fieldErrors: { patientId: ["Paciente não encontrado"] } };
  if (d.serviceId) {
    const svc = await db.service.findFirst({ where: { id: d.serviceId, professionalId, isActive: true }, select: { id: true } });
    if (!svc) return { fieldErrors: { serviceId: ["Serviço inválido"] } };
  }

  const r = await joinWaitlist({
    organizationId: actor.organizationId,
    professionalId,
    patientId: patient.id,
    serviceId: d.serviceId,
    prefs: parsePrefs(d),
    note: d.note,
    source: "MANUAL",
  });
  if (d.priority) await setWaitlistPriority(actor, r.id, true);
  await audit(actor, { organizationId: actor.organizationId, action: r.created ? "waitlist.add" : "waitlist.update", entityType: "WaitlistEntry", entityId: r.id, after: { patientId: patient.id, source: "MANUAL" } });
  revalidatePath("/agenda/espera");
  return { ok: true };
}

export async function offerSlotAction(entryId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await entryInTenant(entryId);
  const parsed = offerSlotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  try {
    await offerSlot(actor, entryId, { startsAt: dateTimeInTz(d.date, d.time, org.timezone), modality: d.modality });
  } catch (e) {
    if (e instanceof WaitlistError) return { error: e.message, values: { date: d.date, time: d.time, modality: d.modality } };
    throw e;
  }
  revalidatePath("/agenda/espera");
  revalidatePath("/agenda");
  return { ok: true };
}

/** Oferta a partir de um horário que vagou (página da sessão cancelada). */
export async function offerCancelledSlotAction(entryId: string, appointmentId: string): Promise<{ ok: boolean; message: string }> {
  const { actor } = await entryInTenant(entryId);
  const a = await db.appointment.findFirst({
    where: { id: appointmentId, organizationId: actor.organizationId, status: { in: ["CANCELLED_BY_PATIENT", "CANCELLED_BY_PROFESSIONAL", "EXPIRED"] } },
    select: { startsAt: true, modality: true },
  });
  if (!a || (a.modality !== "IN_PERSON" && a.modality !== "ONLINE")) return { ok: false, message: "Sessão não encontrada" };
  try {
    await offerSlot(actor, entryId, { startsAt: a.startsAt, modality: a.modality });
  } catch (e) {
    if (e instanceof WaitlistError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath(`/agenda/${appointmentId}`);
  revalidatePath("/agenda/espera");
  return { ok: true, message: "Horário oferecido. A pessoa recebe o link no WhatsApp." };
}

export async function removeFromWaitlistAction(entryId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await entryInTenant(entryId);
  const parsed = removeWaitlistSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    await removeFromWaitlist(actor, entryId, parsed.data.reason);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro" };
  }
  revalidatePath("/agenda/espera");
  return { ok: true };
}

export async function togglePriorityAction(entryId: string, priority: boolean): Promise<void> {
  const { actor } = await entryInTenant(entryId);
  await setWaitlistPriority(actor, entryId, priority);
  revalidatePath("/agenda/espera");
}
