import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { anonymizeExpiredPatients } from "../src/lib/lgpd/anonymize";
import { encrypt, encryptBytes } from "../src/lib/crypto";
import { getStorage } from "../src/lib/storage";

/**
 * Verificação de integração da anonimização, no banco local.
 *   npx tsx --conditions=react-server scripts/lgpd-check.ts
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const pro = await db.professional.findFirstOrThrow({ where: { services: { some: {} } }, include: { services: { take: 1 }, user: true } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: pro.organizationId }, select: { id: true, retentionYears: true } });
  const service = pro.services[0];
  // Paciente "antigo": última sessão e exclusão há (retenção + 1) anos.
  const sixYearsAgo = new Date();
  sixYearsAgo.setUTCFullYear(sixYearsAgo.getUTCFullYear() - (org.retentionYears + 1));

  const patient = await db.patient.create({
    data: {
      organizationId: org.id,
      name: "Fulana de Tal",
      whatsapp: "+5511900000099",
      email: "fulana@exemplo.com",
      adminNotes: "prefere manhã",
      deletedAt: sixYearsAgo,
    },
  });
  const appt = await db.appointment.create({
    data: {
      organizationId: org.id,
      professionalId: pro.id,
      patientId: patient.id,
      serviceId: service.id,
      startsAt: sixYearsAgo,
      endsAt: new Date(sixYearsAgo.getTime() + 50 * 60_000),
      modality: "ONLINE",
      status: "COMPLETED",
      serviceNameSnapshot: service.name,
      priceCents: 20000,
      durationMinutes: 50,
      patientNote: "me chame de Fu",
      adminNote: "pagou em dinheiro",
      confirmationToken: "tok-lgpd-check-000000000000",
      paymentStatus: "PAID",
      payments: { create: { amountCents: 20000, method: "CASH", note: "troco" } },
    },
  });
  await db.clinicalNote.create({
    data: { patientId: patient.id, professionalId: pro.id, authorUserId: pro.user!.id, appointmentId: appt.id, contentEnc: encrypt("conteúdo clínico sigiloso") },
  });
  // Documento clínico: blob cifrado no storage privado + linha.
  const storage = getStorage();
  const { key: docKey } = await storage.putPrivate(`clinical/${patient.id}/lgpd-check.bin`, encryptBytes(Buffer.from("%PDF-1.4 laudo sigiloso")));
  await db.clinicalDocument.create({
    data: {
      patientId: patient.id,
      professionalId: pro.id,
      authorUserId: pro.user!.id,
      titleEnc: encrypt("Laudo"),
      fileNameEnc: encrypt("laudo.pdf"),
      contentType: "application/pdf",
      sizeBytes: 23,
      storageKey: docKey,
    },
  });
  await db.notification.create({
    data: { organizationId: org.id, appointmentId: appt.id, patientId: patient.id, channel: "WHATSAPP", type: "BOOKING_CONFIRMED", status: "SENT", recipient: patient.whatsapp, payload: { bodyVariables: ["Fulana"] } },
  });
  await db.auditLog.create({ data: { organizationId: org.id, action: "patient.update", entityType: "Patient", entityId: patient.id, before: { name: "Fulana" }, after: { name: "Fulana de Tal" } } });

  // Módulos do Mind: pacote com observação + consumo revertido com motivo; comissão com observação.
  const pkg = await db.package.create({ data: { organizationId: org.id, professionalId: pro.id, name: "LGPD 4", sessionsCount: 4, priceCents: 80000, validityDays: 90 } });
  const purchase = await db.packagePurchase.create({
    data: { organizationId: org.id, patientId: patient.id, packageId: pkg.id, professionalId: pro.id, nameSnapshot: "LGPD 4", sessionsTotal: 4, priceCents: 80000, expiresAt: sixYearsAgo, status: "CANCELLED", cancelledAt: sixYearsAgo, cancelReason: "Fulana mudou de cidade", note: "pagou em 2x, pediu recibo",
      consumptions: { create: { appointmentId: appt.id, reason: "completed", revertedAt: sixYearsAgo, revertReason: "Fulana contestou" } } },
  });
  const entry = await db.commissionEntry.create({ data: { organizationId: org.id, professionalId: pro.id, kind: "ADJUSTMENT", appointmentId: appt.id, baseCents: 0, amountCents: 5000, occurredAt: sixYearsAgo, note: "ajuste sessão da Fulana" } });

  // Paciente "recente": excluído ontem — NÃO deve ser anonimizado.
  const recent = await db.patient.create({ data: { organizationId: org.id, name: "Recente", whatsapp: "+5511900000098", deletedAt: new Date(Date.now() - 86400_000) } });

  const result = await anonymizeExpiredPatients();
  console.log("job:", result);

  const p = await db.patient.findUniqueOrThrow({ where: { id: patient.id } });
  const a = await db.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { payments: true } });
  const notes = await db.clinicalNote.count({ where: { patientId: patient.id } });
  const docs = await db.clinicalDocument.count({ where: { patientId: patient.id } });
  const blob = await storage.getPrivate(docKey);
  const n = await db.notification.findFirstOrThrow({ where: { patientId: patient.id } });
  const logs = await db.auditLog.findMany({ where: { entityType: "Patient", entityId: patient.id }, orderBy: { createdAt: "asc" } });
  const r = await db.patient.findUniqueOrThrow({ where: { id: recent.id } });
  const pp = await db.packagePurchase.findUniqueOrThrow({ where: { id: purchase.id }, include: { consumptions: true } });
  const ce = await db.commissionEntry.findUniqueOrThrow({ where: { id: entry.id } });

  const checks: Array<[string, boolean]> = [
    ["antigo anonimizado", p.anonymizedAt !== null],
    ["nome/contato/notas removidos", p.name === "Paciente anonimizado" && p.whatsapp === `anon:${patient.id}` && p.email === null && p.adminNotes === null],
    ["sessão mantida com valor e status", a.status === "COMPLETED" && a.priceCents === 20000],
    ["textos da sessão removidos", a.patientNote === null && a.adminNote === null && a.confirmationToken === null],
    ["pagamento mantido sem observação", a.payments.length === 1 && a.payments[0].note === null],
    ["notas clínicas apagadas", notes === 0],
    ["documentos clínicos apagados (linha e blob)", docs === 0 && blob === null],
    ["notificação sem destinatário/payload", n.recipient === "anonimizado" && JSON.stringify(n.payload) === "{}"],
    ["auditoria antiga sem before/after, rastro mantido", logs[0].before === null && logs[0].after === null && logs.some((l) => l.action === "patient.anonymize")],
    ["pacote mantido (valor/status), textos removidos", pp.priceCents === 80000 && pp.status === "CANCELLED" && pp.note === null && pp.cancelReason === null && pp.consumptions[0]?.revertReason === null],
    ["comissão mantida sem observação", ce.amountCents === 5000 && ce.note === null],
    ["recente intocado", r.anonymizedAt === null && r.name === "Recente"],
    ["idempotente", (await anonymizeExpiredPatients()).anonymized === 0],
  ];
  for (const [label, ok] of checks) console.log(ok ? "✔" : "✖", label);

  await db.patient.deleteMany({ where: { id: { in: [patient.id, recent.id] } } });
  await db.commissionEntry.deleteMany({ where: { id: entry.id } }).catch(() => {});
  await db.package.deleteMany({ where: { id: pkg.id } });
  await storage.deletePrivate(docKey).catch(() => {}); // se o job não rodou, o blob de teste não pode ficar
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
