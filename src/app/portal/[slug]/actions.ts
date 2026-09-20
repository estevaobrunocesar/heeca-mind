"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { serializeCommsPrefs } from "@/lib/comms-prefs";
import { Prisma } from "@/generated/prisma/client";
import { type FormState, formValues, invalid } from "@/lib/form";
import { cancelFromPortal, getPortalActor, logout, openDocumentFromPortal, PortalError, professionalBySlug, requestAccess, rescheduleFromPortal } from "@/lib/portal/service";
import { clientIp, rateLimit, rateLimitAll, retryMessage, RULES } from "@/lib/rate-limit";
import { checkbox } from "@/lib/validation/common";
import { brPhone } from "@/lib/validation/professional";

async function actorFor(slug: string) {
  const pro = await professionalBySlug(slug);
  if (!pro) throw new Error("Página não encontrada");
  const actor = await getPortalActor(pro.organizationId);
  if (!actor) redirect(`/portal/${slug}?expired=1`);
  return { pro, actor };
}

/** Pede o link mágico. Resposta neutra: não diz se o número existe. */
export async function requestAccessAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const pro = await professionalBySlug(slug);
  if (!pro) return { error: "Página não encontrada." };
  const parsed = brPhone.safeParse(String(formData.get("whatsapp") ?? ""));
  if (!parsed.success || !parsed.data) return { fieldErrors: { whatsapp: ["Informe o WhatsApp com DDD."] }, values: formValues(formData) };
  const limited = await rateLimitAll([
    { rule: RULES.portalPhone, identifier: parsed.data },
    { rule: RULES.portalIp, identifier: await clientIp() },
  ]);
  if (!limited.ok) return { error: retryMessage(limited.retryAfterSeconds) };
  await requestAccess(pro.organizationId, parsed.data);
  return { ok: true };
}

export async function logoutAction(slug: string) {
  await logout();
  redirect(`/portal/${slug}`);
}

export async function cancelAppointmentPortalAction(slug: string, appointmentId: string): Promise<{ error?: string }> {
  const { actor } = await actorFor(slug);
  try {
    await cancelFromPortal(actor, appointmentId);
  } catch (e) {
    if (e instanceof PortalError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/portal/${slug}`);
  redirect(`/portal/${slug}?cancelled=1`);
}

export async function rescheduleAppointmentPortalAction(slug: string, appointmentId: string, startIso: string): Promise<{ error?: string }> {
  const { actor } = await actorFor(slug);
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return { error: "Horário inválido." };
  try {
    await rescheduleFromPortal(actor, appointmentId, start);
  } catch (e) {
    if (e instanceof PortalError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/portal/${slug}`);
  redirect(`/portal/${slug}?rescheduled=1`);
}

export async function openDocumentPortalAction(slug: string, requestId: string) {
  const { actor } = await actorFor(slug);
  const ip = await clientIp();
  if (ip) {
    const r = await rateLimit(RULES.tokenActionIp, ip);
    if (!r.ok) throw new Error(retryMessage(r.retryAfterSeconds));
  }
  const token = await openDocumentFromPortal(actor, requestId);
  if (!token) redirect(`/portal/${slug}`);
  redirect(`/documento/${token}`);
}

const optionalText = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
/** O que o paciente edita sozinho: contato e endereço. WhatsApp é identidade — só a recepção muda. */
const selfSchema = z.object({
  email: z.string().trim().toLowerCase().transform((v) => (v === "" ? null : v)).refine((v) => v === null || z.string().email().safeParse(v).success, "E-mail inválido"),
  phone: brPhone,
  addressLine: optionalText(200),
  addressCity: optionalText(80),
  addressState: z.string().trim().toUpperCase().transform((v) => (v === "" ? null : v)).refine((v) => v === null || /^[A-Z]{2}$/.test(v), "Use a sigla do estado"),
  addressZip: z.string().trim().transform((v) => v.replace(/\D/g, "")).transform((v) => (v === "" ? null : v)).refine((v) => v === null || v.length === 8, "CEP inválido"),
  emergencyContactName: optionalText(120),
  emergencyContactPhone: brPhone,
  prefWhatsapp: checkbox,
  prefReminder24h: checkbox,
  prefReminder2h: checkbox,
});

export async function updateSelfAction(slug: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await actorFor(slug);
  const parsed = selfSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const { prefWhatsapp, prefReminder24h, prefReminder2h, ...columns } = parsed.data;
  const commsPrefs = serializeCommsPrefs({ whatsapp: prefWhatsapp, reminder24h: prefReminder24h, reminder2h: prefReminder2h });
  await db.patient.update({ where: { id: actor.patientId }, data: { ...columns, commsPrefs: commsPrefs ?? Prisma.JsonNull } });
  await audit(null, { organizationId: actor.organizationId, action: "patient.self_update", entityType: "Patient", entityId: actor.patientId, after: { by: "portal", fields: Object.keys(columns) } });
  revalidatePath(`/portal/${slug}/dados`);
  return { ok: true };
}
