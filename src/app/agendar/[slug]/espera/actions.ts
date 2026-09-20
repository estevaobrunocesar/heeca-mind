"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { clientIp, rateLimitAll, retryMessage, RULES } from "@/lib/rate-limit";
import { publicWaitlistSchema } from "@/lib/validation/waitlist";
import { enqueueWaitlistJoined, joinWaitlist } from "@/lib/waitlist";
import { parsePrefs } from "@/lib/waitlist-match";
import { notifyProfessional } from "@/lib/pro-notify";

/**
 * Entrada pública na lista de espera. Mesmas proteções do agendamento
 * público (rate limit por IP/telefone/profissional, honeypot, paciente
 * reaproveitado pelo WhatsApp). Uma entrada ativa por (paciente, profissional):
 * repetir só atualiza as preferências.
 */
export async function joinWaitlistAction(prev: FormState & { slug: string }, formData: FormData): Promise<FormState & { slug: string }> {
  const { slug } = prev;
  const ip = await clientIp();
  const ipCheck = await rateLimitAll([{ rule: RULES.publicBookingIp, identifier: ip }]);
  if (!ipCheck.ok) return { slug, error: retryMessage(ipCheck.retryAfterSeconds), values: formValues(formData) };

  const parsed = publicWaitlistSchema.safeParse({ ...Object.fromEntries(formData), weekdays: formData.getAll("weekdays").map(String), periods: formData.getAll("periods").map(String) });
  if (!parsed.success) return { slug, ...invalid(parsed.error, formData) };
  const d = parsed.data;

  const professional = await db.professional.findFirst({
    where: { slug, isActive: true },
    select: { id: true, organizationId: true, services: { where: { isActive: true, ...(d.serviceId ? { id: d.serviceId } : {}) }, take: 1, select: { id: true } } },
  });
  if (!professional) return { slug, error: "Profissional não encontrado." };

  const scoped = await rateLimitAll([
    { rule: RULES.publicBookingPhone, identifier: d.whatsapp! },
    { rule: RULES.publicBookingProfessional, identifier: professional.id },
  ]);
  if (!scoped.ok) return { slug, error: retryMessage(scoped.retryAfterSeconds), values: formValues(formData) };

  const patient = await db.patient.upsert({
    where: { organizationId_whatsapp: { organizationId: professional.organizationId, whatsapp: d.whatsapp! } },
    create: { organizationId: professional.organizationId, name: d.name, whatsapp: d.whatsapp!, lgpdConsentAt: new Date() },
    update: { lgpdConsentAt: new Date() },
    select: { id: true, deletedAt: true },
  });
  if (patient.deletedAt) await db.patient.update({ where: { id: patient.id }, data: { deletedAt: null, name: d.name } });

  const r = await joinWaitlist({
    organizationId: professional.organizationId,
    professionalId: professional.id,
    patientId: patient.id,
    serviceId: d.serviceId && professional.services[0] ? professional.services[0].id : null,
    prefs: parsePrefs(d),
    note: null,
    source: "PUBLIC_PAGE",
  });
  await audit(null, { organizationId: professional.organizationId, action: r.created ? "waitlist.join" : "waitlist.update", entityType: "WaitlistEntry", entityId: r.id, after: { source: "PUBLIC_PAGE" } });
  if (r.created) {
    await enqueueWaitlistJoined(r.id);
    await notifyProfessional({ event: "WAITLIST_JOINED", waitlistEntryId: r.id });
  }

  redirect(`/agendar/${slug}/espera/ok`);
}
