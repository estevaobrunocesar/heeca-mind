import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { anonymizeExpiredPatients } from "../src/lib/lgpd/anonymize";
import { encrypt } from "../src/lib/crypto";

/**
 * Verificação de integração da anonimização, no banco local.
 *   npx tsx --conditions=react-server scripts/lgpd-check.ts
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const org = await db.organization.findFirstOrThrow({ include: { professionals: { take: 1, include: { services: { take: 1 }, user: true } } } });
  const pro = org.professionals[0];
  const service = pro.services[0];
  const sixYearsAgo = new Date();
  sixYearsAgo.setUTCFullYear(sixYearsAgo.getUTCFullYear() - 6);

  // Paciente "antigo": última sessão e exclusão há 6 anos (retenção 5).
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
  await db.notification.create({
    data: { organizationId: org.id, appointmentId: appt.id, patientId: patient.id, channel: "WHATSAPP", type: "BOOKING_CONFIRMED", status: "SENT", recipient: patient.whatsapp, payload: { bodyVariables: ["Fulana"] } },
  });
  await db.auditLog.create({ data: { organizationId: org.id, action: "patient.update", entityType: "Patient", entityId: patient.id, before: { name: "Fulana" }, after: { name: "Fulana de Tal" } } });

  // Paciente "recente": excluído ontem — NÃO deve ser anonimizado.
  const recent = await db.patient.create({ data: { organizationId: org.id, name: "Recente", whatsapp: "+5511900000098", deletedAt: new Date(Date.now() - 86400_000) } });

  const result = await anonymizeExpiredPatients();
  console.log("job:", result);

  const p = await db.patient.findUniqueOrThrow({ where: { id: patient.id } });
  const a = await db.appointment.findUniqueOrThrow({ where: { id: appt.id }, include: { payments: true } });
  const notes = await db.clinicalNote.count({ where: { patientId: patient.id } });
  const n = await db.notification.findFirstOrThrow({ where: { patientId: patient.id } });
  const logs = await db.auditLog.findMany({ where: { entityType: "Patient", entityId: patient.id }, orderBy: { createdAt: "asc" } });
  const r = await db.patient.findUniqueOrThrow({ where: { id: recent.id } });

  const checks: Array<[string, boolean]> = [
    ["antigo anonimizado", p.anonymizedAt !== null],
    ["nome/contato/notas removidos", p.name === "Paciente anonimizado" && p.whatsapp === `anon:${patient.id}` && p.email === null && p.adminNotes === null],
    ["sessão mantida com valor e status", a.status === "COMPLETED" && a.priceCents === 20000],
    ["textos da sessão removidos", a.patientNote === null && a.adminNote === null && a.confirmationToken === null],
    ["pagamento mantido sem observação", a.payments.length === 1 && a.payments[0].note === null],
    ["notas clínicas apagadas", notes === 0],
    ["notificação sem destinatário/payload", n.recipient === "anonimizado" && JSON.stringify(n.payload) === "{}"],
    ["auditoria antiga sem before/after, rastro mantido", logs[0].before === null && logs[0].after === null && logs.some((l) => l.action === "patient.anonymize")],
    ["recente intocado", r.anonymizedAt === null && r.name === "Recente"],
    ["idempotente", (await anonymizeExpiredPatients()).anonymized === 0],
  ];
  for (const [label, ok] of checks) console.log(ok ? "✔" : "✖", label);

  await db.patient.deleteMany({ where: { id: { in: [patient.id, recent.id] } } });
  if (checks.some(([, ok]) => !ok)) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
