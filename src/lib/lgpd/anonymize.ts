import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/lib/audit";
import { purgeDocumentBlobs } from "@/lib/clinical";
import { db } from "@/lib/db";
import { isAnonymizationDue } from "./retention";

/**
 * Anonimização irreversível de um paciente.
 *
 * O que some: tudo que identifica a pessoa ou carrega texto livre sobre ela
 * (nome, contato, observações, notas clínicas, payloads de mensagens,
 * before/after da auditoria). O que fica: sessões, valores, status e datas —
 * dados estatísticos e financeiros sem titular identificável.
 *
 * A unicidade (organizationId, whatsapp) é preservada com um valor sintético
 * derivado do id, que nunca colide com um telefone real.
 */
export async function anonymizePatient(patientId: string, reason: "retention" | "manual" = "retention") {
  const patient = await db.patient.findUniqueOrThrow({
    where: { id: patientId },
    select: { id: true, organizationId: true, anonymizedAt: true, appointments: { select: { id: true } } },
  });
  if (patient.anonymizedAt) return { alreadyDone: true as const };

  const appointmentIds = patient.appointments.map((a) => a.id);
  const now = new Date();
  // Blobs dos documentos clínicos: apagados do storage DEPOIS da transação
  // (storage não faz rollback). Se a transação falhar, nada foi apagado.
  const documentKeys = (await db.clinicalDocument.findMany({ where: { patientId }, select: { storageKey: true } })).map((d) => d.storageKey);

  await db.$transaction(async (tx) => {
    await tx.patient.update({
      where: { id: patientId },
      data: {
        name: "Paciente anonimizado",
        whatsapp: `anon:${patientId}`,
        email: null,
        phone: null,
        birthDate: null,
        addressLine: null,
        addressCity: null,
        addressState: null,
        addressZip: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        commsPrefs: Prisma.JsonNull,
        adminNotes: null,
        bestContactTime: null,
        usualModality: null,
        preferredPaymentMethod: null,
        needsReceipt: false,
        lgpdConsentAt: null,
        followUpStatus: "INACTIVE",
        deletedAt: patient.appointments.length === 0 ? now : undefined,
        anonymizedAt: now,
      },
    });
    await tx.appointment.updateMany({
      where: { patientId },
      data: { patientNote: null, adminNote: null, onlineLink: null, cancelReason: null, confirmationToken: null },
    });
    await tx.payment.updateMany({ where: { appointmentId: { in: appointmentIds } }, data: { note: null } });
    await tx.receipt.updateMany({ where: { patientId }, data: { pdfUrl: null } });
    await tx.notification.updateMany({
      where: { OR: [{ patientId }, { appointmentId: { in: appointmentIds } }] },
      data: { recipient: "anonimizado", payload: {}, error: null },
    });
    // Notas e documentos clínicos: fim do prazo de guarda = fim do registro.
    await tx.clinicalNote.deleteMany({ where: { patientId } });
    await tx.clinicalDocument.deleteMany({ where: { patientId } });
    await tx.formRequest.deleteMany({ where: { patientId } }); // respostas (clínicas ou termos) somem com o titular
    await tx.recurringSeries.updateMany({ where: { patientId }, data: { isActive: false } });
    await tx.patientTag.deleteMany({ where: { patientId } }); // etiquetas podem identificar ("convênio X")
    // D6: o termo aceito é prova contratual — fica o texto e o hash; sai o que identifica a pessoa.
    await tx.documentRequest.updateMany({ where: { patientId }, data: { acceptName: null, acceptIp: null, acceptUserAgent: null } });
    await tx.documentRequest.updateMany({ where: { patientId, status: { in: ["PENDING", "VIEWED"] } }, data: { status: "REVOKED", revokeReason: "anonimização" } });
    await tx.waitlistEntry.updateMany({ where: { patientId }, data: { note: null, removedReason: null, status: "REMOVED" } });
    // Auditoria: mantém o rastro (quem, quando, qual ação), remove o conteúdo.
    // SQL direto: updateMany do Prisma não aceita NULL literal em campos Json.
    await tx.$executeRaw`UPDATE audit_logs SET "before" = NULL, "after" = NULL WHERE ("entityType" = 'Patient' AND "entityId" = ${patientId}) OR ("entityType" = 'Appointment' AND "entityId" = ANY(${appointmentIds}::text[]))`;
  });

  const blobsFailed = await purgeDocumentBlobs(documentKeys);
  if (blobsFailed.length > 0) {
    // Linhas já sumiram; o blob é cifrado e sem chave de lookup. Fica registrado para limpeza manual.
    console.error(`[lgpd] ${blobsFailed.length} blob(s) do paciente ${patientId} não apagados do storage:`, blobsFailed);
  }

  await audit(null, {
    organizationId: patient.organizationId,
    action: "patient.anonymize",
    entityType: "Patient",
    entityId: patientId,
    after: { reason, appointments: appointmentIds.length, documents: documentKeys.length, blobsFailed: blobsFailed.length },
  });

  return { alreadyDone: false as const, appointments: appointmentIds.length };
}

/**
 * Job: anonimiza cadastros excluídos cujo prazo de retenção venceu.
 * Idempotente e barato quando não há nada a fazer.
 */
export async function anonymizeExpiredPatients(now = new Date()) {
  const candidates = await db.patient.findMany({
    where: { deletedAt: { not: null }, anonymizedAt: null },
    select: {
      id: true,
      deletedAt: true,
      organization: { select: { retentionYears: true } },
      appointments: { orderBy: { startsAt: "desc" }, take: 1, select: { startsAt: true } },
    },
  });

  let anonymized = 0;
  for (const c of candidates) {
    const due = isAnonymizationDue(
      { deletedAt: c.deletedAt, lastAppointmentAt: c.appointments[0]?.startsAt ?? null, retentionYears: c.organization.retentionYears },
      now,
    );
    if (!due) continue;
    await anonymizePatient(c.id, "retention");
    anonymized++;
  }
  return { candidates: candidates.length, anonymized };
}

/** Eventos brutos do webhook carregam telefones; 90 dias bastam para auditoria de entrega. */
export async function purgeOldWebhookEvents(days = 90) {
  const r = await db.whatsAppWebhookEvent.deleteMany({
    where: { receivedAt: { lt: new Date(Date.now() - days * 24 * 3600 * 1000) }, processedAt: { not: null } },
  });
  return r.count;
}
