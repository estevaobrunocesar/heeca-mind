"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { isSlotAvailable } from "@/lib/availability";
import { loadAvailabilityInput } from "@/lib/availability-data";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { enqueueAppointmentNotification } from "@/lib/notifications";
import { dateTimeInTz } from "@/lib/time";
import { publicBookingSchema } from "@/lib/validation/booking";

/**
 * Solicitação de agendamento pela página pública.
 *
 * Proteções:
 *  - O slot é recalculado no servidor (grade, buffer, antecedência) — o
 *    cliente só sugere.
 *  - Lock consultivo por profissional dentro da transação: duas pessoas
 *    escolhendo o mesmo horário ao mesmo tempo não criam duas sessões.
 *  - Paciente é reaproveitado pelo WhatsApp; o nome cadastrado não é
 *    sobrescrito por um formulário anônimo.
 */
export async function createPublicBookingAction(
  prev: FormState & { slug: string },
  formData: FormData,
): Promise<FormState & { slug: string }> {
  const { slug } = prev;
  const parsed = publicBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { slug, ...invalid(parsed.error, formData) };
  const d = parsed.data;

  const professional = await db.professional.findFirst({
    where: { slug, isActive: true },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { timezone: true } },
      services: { where: { id: d.serviceId, isActive: true }, take: 1 },
    },
  });
  const service = professional?.services[0];
  if (!professional || !service) return { slug, error: "Este atendimento não está mais disponível." };
  if (service.modality !== "HYBRID" && service.modality !== d.modality) {
    return { slug, error: "Modalidade indisponível para este atendimento.", values: formValues(formData) };
  }

  const tz = professional.organization.timezone;
  const startsAt = dateTimeInTz(d.date, d.time, tz);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  const result = await db.$transaction(async (tx) => {
    // Serializa agendamentos do mesmo profissional até o fim da transação.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${professional.id}))`;

    const input = await loadAvailabilityInput({
      professionalId: professional.id,
      fromISO: d.date,
      toISO: d.date,
      durationMinutes: service.durationMinutes,
    });
    if (!isSlotAvailable(input, startsAt)) return { conflict: true as const };

    const patient = await tx.patient.upsert({
      where: { organizationId_whatsapp: { organizationId: professional.organizationId, whatsapp: d.whatsapp! } },
      create: {
        organizationId: professional.organizationId,
        name: d.name,
        whatsapp: d.whatsapp!,
        email: d.email,
        usualModality: d.modality,
        lgpdConsentAt: new Date(),
        firstAppointmentAt: startsAt,
      },
      update: {
        lgpdConsentAt: new Date(),
        ...(d.email ? { email: d.email } : {}),
      },
      select: { id: true, deletedAt: true },
    });
    if (patient.deletedAt) {
      // Paciente excluído (LGPD) voltou a agendar: reativa o cadastro.
      await tx.patient.update({ where: { id: patient.id }, data: { deletedAt: null, name: d.name } });
    }

    const appointment = await tx.appointment.create({
      data: {
        organizationId: professional.organizationId,
        professionalId: professional.id,
        patientId: patient.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        modality: d.modality,
        status: "AWAITING_CONFIRMATION",
        source: "PUBLIC_PAGE",
        serviceNameSnapshot: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        patientNote: d.note,
        confirmationToken: randomBytes(24).toString("base64url"),
      },
      select: { id: true, confirmationToken: true },
    });
    return { conflict: false as const, appointment };
  });

  if (result.conflict) {
    return {
      slug,
      error: "Esse horário acabou de ser reservado. Escolha outro, por favor.",
      values: { ...formValues(formData), time: "" },
    };
  }

  await audit(null, {
    organizationId: professional.organizationId,
    action: "appointment.request",
    entityType: "Appointment",
    entityId: result.appointment.id,
    after: { source: "PUBLIC_PAGE", startsAt },
  });
  await enqueueAppointmentNotification(result.appointment.id, "BOOKING_REQUEST");

  redirect(`/agendar/${slug}/solicitado?id=${result.appointment.id}`);
}
