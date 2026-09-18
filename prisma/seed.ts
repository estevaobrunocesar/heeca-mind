import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Seed de desenvolvimento: uma psicóloga autônoma com serviços, grade semanal,
 * dois pacientes e algumas sessões.
 *
 * Login: ana@exemplo.com / senha12345
 * Página pública: /agendar/dra-ana-lucia
 */

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function at(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  const email = "ana@exemplo.com";
  if (await db.user.findUnique({ where: { email } })) {
    console.log("Seed já aplicado.");
    return;
  }

  const passwordHash = await hash("senha12345", 12);

  const user = await db.user.create({ data: { email, passwordHash, name: "Ana Lúcia Ferreira" } });
  const org = await db.organization.create({ data: { name: "Dra. Ana Lúcia", type: "SOLO" } });
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });

  const pro = await db.professional.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      displayName: "Dra. Ana Lúcia",
      fullName: "Ana Lúcia Ferreira",
      crp: "06/123456",
      slug: "dra-ana-lucia",
      bio: "Psicóloga clínica com atuação em terapia cognitivo-comportamental para adultos. Atendimento presencial em Pinheiros e online.",
      approaches: ["TCC"],
      specialties: ["Ansiedade", "Transições de carreira"],
      whatsapp: "+5511999990000",
      email,
      addressLine: "Rua dos Pinheiros, 100 — sala 42",
      addressCity: "São Paulo",
      addressState: "SP",
      onlinePlatform: "GOOGLE_MEET",
      onlineFixedLink: "https://meet.google.com/abc-defg-hij",
      scheduleSettings: { create: {} },
      policy: {
        create: {
          cancellationPolicy:
            "Cancelamentos ou reagendamentos devem ser feitos com pelo menos 24 horas de antecedência.",
          onlineInstructions: "Esteja em um ambiente reservado, com fones de ouvido e boa conexão.",
        },
      },
      availability: {
        create: [1, 2, 3, 4, 5].flatMap((weekday) => [
          { weekday, startTime: "09:00", endTime: "12:00" },
          { weekday, startTime: "14:00", endTime: "19:00" },
        ]),
      },
    },
  });

  const [individual, online, casal] = await Promise.all([
    db.service.create({
      data: {
        professionalId: pro.id,
        name: "Psicoterapia individual (presencial)",
        durationMinutes: 50,
        priceCents: 25000,
        modality: "IN_PERSON",
        sortOrder: 1,
      },
    }),
    db.service.create({
      data: {
        professionalId: pro.id,
        name: "Psicoterapia individual (online)",
        durationMinutes: 50,
        priceCents: 22000,
        modality: "ONLINE",
        sortOrder: 2,
        patientInstructions: "O link da sessão será enviado por WhatsApp no dia.",
      },
    }),
    db.service.create({
      data: {
        professionalId: pro.id,
        name: "Terapia de casal",
        durationMinutes: 80,
        priceCents: 38000,
        modality: "HYBRID",
        sortOrder: 3,
      },
    }),
  ]);

  const [joao, maria] = await Promise.all([
    db.patient.create({
      data: {
        organizationId: org.id,
        name: "João Pereira",
        whatsapp: "+5511988880001",
        email: "joao@exemplo.com",
        usualModality: "ONLINE",
        adminNotes: "Prefere online. Sessões semanais às terças.",
        firstAppointmentAt: at(-30, 15),
      },
    }),
    db.patient.create({
      data: {
        organizationId: org.id,
        name: "Maria Souza",
        whatsapp: "+5511988880002",
        usualModality: "IN_PERSON",
        needsReceipt: true,
        preferredPaymentMethod: "PIX",
        firstAppointmentAt: at(-10, 10),
      },
    }),
  ]);

  const mk = (patientId: string, service: typeof individual, start: Date, status: "CONFIRMED" | "COMPLETED" | "PENDING", modality: "IN_PERSON" | "ONLINE") =>
    db.appointment.create({
      data: {
        organizationId: org.id,
        professionalId: pro.id,
        patientId,
        serviceId: service.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + service.durationMinutes * 60_000),
        modality,
        status,
        source: "MANUAL",
        serviceNameSnapshot: service.name,
        priceCents: service.priceCents,
        durationMinutes: service.durationMinutes,
        paymentStatus: status === "COMPLETED" ? "PAID" : "PENDING",
        paymentMethod: status === "COMPLETED" ? "PIX" : null,
        paidAt: status === "COMPLETED" ? start : null,
        completedAt: status === "COMPLETED" ? start : null,
        confirmedAt: status !== "PENDING" ? new Date() : null,
      },
    });

  await Promise.all([
    mk(joao.id, online, at(-7, 15), "COMPLETED", "ONLINE"),
    mk(joao.id, online, at(0, 15), "CONFIRMED", "ONLINE"),
    mk(joao.id, online, at(7, 15), "CONFIRMED", "ONLINE"),
    mk(maria.id, individual, at(1, 10), "CONFIRMED", "IN_PERSON"),
    mk(maria.id, casal, at(3, 17), "PENDING", "IN_PERSON"),
  ]);

  console.log("Seed aplicado.");
  console.log("  login: ana@exemplo.com / senha12345");
  console.log("  público: /agendar/dra-ana-lucia");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
