import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { Actor } from "../src/lib/permissions";

/**
 * Isolamento por tenant dos módulos do Mind (docs/mind/02-ERD.md §5, 07-TESTES.md §2).
 *   npm run check:tenant
 *
 * Cria duas organizações (A e B) com profissional, paciente, pacote, documento, comissão e sessão do
 * portal; um ator de B tenta ler/agir sobre tudo de A pelos SERVIÇOS (não pelo Prisma cru). Cada
 * tentativa precisa devolver vazio/null ou lançar. Depois apaga tudo.
 */
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

type Fixture = { orgId: string; proId: string; patientId: string; apptId: string; purchaseId: string; docId: string; ruleId: string };

async function makeOrg(tag: string): Promise<Fixture> {
  const org = await db.organization.create({ data: { name: `Org ${tag}`, type: "SOLO" } });
  const user = await db.user.create({ data: { email: `owner-${tag}-${Date.now()}@teste.local`, passwordHash: "x", name: `Owner ${tag}` } });
  await db.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  const pro = await db.professional.create({ data: { organizationId: org.id, userId: user.id, displayName: `Pro ${tag}`, fullName: `Pro ${tag}`, registrationNumber: "06/000000", slug: `pro-${tag}-${Date.now()}` } });
  await db.scheduleSettings.create({ data: { professionalId: pro.id } });
  await db.professionalPolicy.create({ data: { professionalId: pro.id } });
  const service = await db.service.create({ data: { professionalId: pro.id, name: "Sessão", durationMinutes: 50, priceCents: 10000, modality: "ONLINE" } });
  const patient = await db.patient.create({ data: { organizationId: org.id, name: `Paciente ${tag}`, whatsapp: `+55119${String(Date.now()).slice(-8)}` } });
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  const appt = await db.appointment.create({ data: { organizationId: org.id, professionalId: pro.id, patientId: patient.id, serviceId: service.id, startsAt, endsAt: new Date(startsAt.getTime() + 50 * 60_000), modality: "ONLINE", status: "CONFIRMED", serviceNameSnapshot: "Sessão", priceCents: 10000, durationMinutes: 50 } });
  const pkg = await db.package.create({ data: { organizationId: org.id, professionalId: pro.id, name: "Pacote", sessionsCount: 4, priceCents: 36000, validityDays: 90 } });
  const purchase = await db.packagePurchase.create({ data: { organizationId: org.id, patientId: patient.id, packageId: pkg.id, professionalId: pro.id, nameSnapshot: "Pacote", sessionsTotal: 4, priceCents: 36000, expiresAt: new Date(Date.now() + 90 * 86_400_000) } });
  const tpl = await db.documentTemplate.create({ data: { organizationId: org.id, professionalId: pro.id, title: "Termo", body: "Texto {{paciente.nome}}" } });
  const doc = await db.documentRequest.create({ data: { organizationId: org.id, professionalId: pro.id, patientId: patient.id, templateId: tpl.id, templateVersion: 1, kind: "CONSENT", titleSnapshot: "Termo", bodySnapshot: "Texto", bodyHash: "h", tokenHash: `t-${tag}-${Date.now()}`, expiresAt: new Date(Date.now() + 86_400_000) } });
  const rule = await db.commissionRule.create({ data: { organizationId: org.id, professionalId: pro.id, percentBp: 3000, validFrom: new Date("2026-01-01T00:00:00Z") } });
  return { orgId: org.id, proId: pro.id, patientId: patient.id, apptId: appt.id, purchaseId: purchase.id, docId: doc.id, ruleId: rule.id };
}

async function cleanup(f: Fixture) {
  await db.organization.delete({ where: { id: f.orgId } }); // cascata apaga o resto
  await db.user.deleteMany({ where: { email: { endsWith: "@teste.local" }, memberships: { none: {} } } });
}

async function main() {
  // Módulos "server-only": importados dinamicamente sob a condição react-server do tsx.
  const packages = await import("../src/lib/packages/service");
  const documents = await import("../src/lib/documents/service");
  const commissions = await import("../src/lib/commissions/service");
  const reports = await import("../src/lib/reports/service");

  const A = await makeOrg("A");
  const B = await makeOrg("B");
  const actorB: Actor = { userId: "u-b", organizationId: B.orgId, role: "OWNER", professionalId: B.proId, activeProfessionalId: B.proId };
  const failures: string[] = [];
  const expectEmpty = (label: string, v: unknown[]) => { if (v.length !== 0) failures.push(`${label}: devolveu ${v.length} item(ns) de A para B`); };
  const expectNull = (label: string, v: unknown) => { if (v !== null && v !== undefined) failures.push(`${label}: devolveu registro de A para B`); };
  const expectThrow = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); failures.push(`${label}: não lançou`); } catch { /* esperado */ } };

  try {
    expectEmpty("packages.listPurchasesForPatient", await packages.listPurchasesForPatient(actorB, A.patientId));
    await expectThrow("packages.getPurchaseInTenant", () => packages.getPurchaseInTenant(actorB, A.purchaseId));
    expectEmpty("packages.candidatesForAppointment", await packages.candidatesForAppointment(actorB, A.apptId));
    await expectThrow("packages.linkAppointment", () => packages.linkAppointment(actorB, A.apptId, A.purchaseId));
    const pkgA = await db.package.findFirstOrThrow({ where: { organizationId: A.orgId } });
    await expectThrow("packages.sellPackage (pacote de A)", () => packages.sellPackage(actorB, { patientId: B.patientId, packageId: pkgA.id }));

    expectEmpty("documents.listDocumentsForPatient", await documents.listDocumentsForPatient(actorB, A.patientId));
    expectNull("documents.getDocumentInTenant", await documents.getDocumentInTenant(actorB, A.docId));
    await expectThrow("documents.revokeDocument", () => documents.revokeDocument(actorB, A.docId, "x"));
    const tplA = await db.documentTemplate.findFirstOrThrow({ where: { organizationId: A.orgId } });
    await expectThrow("documents.sendDocument (modelo de A)", () => documents.sendDocument(actorB, { templateId: tplA.id, patientId: B.patientId }));

    const st = await commissions.statement(actorB, A.proId, { from: new Date("2020-01-01"), to: new Date("2030-01-01") });
    expectEmpty("commissions.statement.entries", st.entries);
    expectEmpty("commissions.statement.rules", st.rules);
    await expectThrow("commissions.closePeriod", () => commissions.closePeriod(actorB, { professionalId: A.proId, periodStart: new Date("2026-01-01T00:00:00Z"), periodEnd: new Date("2026-12-31T00:00:00Z") }, "America/Sao_Paulo"));
    await expectThrow("commissions.addAdjustment", () => commissions.addAdjustment(actorB, { professionalId: A.proId, amountCents: 100, note: "x" }));

    const r = await reports.listReactivation(actorB, A.proId);
    expectEmpty("reports.listReactivation", r.candidates);
    await expectThrow("reports.sendReactivation", () => reports.sendReactivation(actorB, A.proId, A.patientId));
    expectEmpty("reports.surveyResults", await reports.surveyResults(actorB, A.proId, { from: new Date("2020-01-01"), to: new Date("2030-01-01") }));

    // Portal: sessão de A não vale na organização B (o slug de B dá o tenant).
    const sid = `sid-${Date.now()}`;
    await db.patientSession.create({ data: { organizationId: A.orgId, patientId: A.patientId, sid, expiresAt: new Date(Date.now() + 86_400_000) } });
    const crossOrg = await db.patientSession.findFirst({ where: { sid, organizationId: B.orgId } });
    expectNull("portal.session (sid de A na org B)", crossOrg);
  } finally {
    await cleanup(A);
    await cleanup(B);
  }

  if (failures.length) {
    console.error("FALHOU:\n - " + failures.join("\n - "));
    process.exit(1);
  }
  console.log("ok: 16 tentativas cruzadas entre tenants bloqueadas");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
