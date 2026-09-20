import { STATUS_LABEL } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { canViewFinancials } from "@/lib/permissions";
import { getActor } from "@/lib/session";
import { dateTimeInTz, formatDateTimeBR, todayCivilAndMonth } from "@/lib/time";
import { PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";

/**
 * Exportação CSV do mês (Excel/Sheets). Só dados administrativos e
 * financeiros — sem observações, sem clínico.
 */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!actor.activeProfessionalId || !canViewFinancials(actor, actor.activeProfessionalId)) return new Response("Forbidden", { status: 403 });

  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayCivilAndMonth(new Date(), tz).month;
  const [y, m] = month.split("-").map(Number);
  const start = dateTimeInTz(`${month}-01`, "00:00", tz);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const end = dateTimeInTz(`${next}-01`, "00:00", tz);

  const proFilter = actor.activeProfessionalId ? { professionalId: actor.activeProfessionalId } : { organizationId: actor.organizationId };
  const rows = await db.appointment.findMany({
    where: {
      ...proFilter,
      startsAt: { gte: start, lt: end },
      status: { in: ["COMPLETED", "CONFIRMED", "AWAITING_PAYMENT", "NO_SHOW"] },
    },
    orderBy: { startsAt: "asc" },
    select: {
      startsAt: true,
      status: true,
      modality: true,
      serviceNameSnapshot: true,
      priceCents: true,
      paymentStatus: true,
      paymentMethod: true,
      paidAt: true,
      patient: { select: { name: true } },
      professional: { select: { displayName: true } },
    },
  });

  // Pacotes vendidos no mês: entram como linhas próprias (origem "Pacote"); a sessão coberta sai com valor 0.
  const sales = await db.packagePurchase.findMany({
    where: { ...proFilter, purchasedAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    orderBy: { purchasedAt: "asc" },
    select: { purchasedAt: true, nameSnapshot: true, sessionsTotal: true, priceCents: true, paymentStatus: true, patient: { select: { name: true } }, professional: { select: { displayName: true } }, payments: { select: { method: true, paidAt: true }, orderBy: { paidAt: "desc" }, take: 1 } },
  });

  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const header = ["Data", "Origem", "Paciente", "Profissional", "Sessão", "Modalidade", "Status", "Valor", "Pagamento", "Forma", "Pago em"];
  const lines = rows.map((r) =>
    [
      formatDateTimeBR(r.startsAt, tz),
      "Sessão",
      r.patient.name,
      r.professional.displayName,
      r.serviceNameSnapshot,
      r.modality === "ONLINE" ? "Online" : "Presencial",
      STATUS_LABEL[r.status],
      money(r.paymentStatus === "PACKAGE" ? 0 : r.priceCents),
      r.paymentStatus === "PAID" ? "Pago" : r.paymentStatus === "WAIVED" ? "Isento" : r.paymentStatus === "PACKAGE" ? "Pacote" : "Pendente",
      r.paymentMethod ? PAYMENT_METHOD_LABEL[r.paymentMethod] : "",
      r.paidAt ? formatDateTimeBR(r.paidAt, tz) : "",
    ]
      .map(esc)
      .join(";"),
  );
  const saleLines = sales.map((p) =>
    [
      formatDateTimeBR(p.purchasedAt, tz),
      "Pacote",
      p.patient.name,
      p.professional.displayName,
      `${p.nameSnapshot} (${p.sessionsTotal} sessões)`,
      "",
      "Venda",
      money(p.priceCents),
      p.paymentStatus === "PAID" ? "Pago" : "Pendente",
      p.payments[0] ? PAYMENT_METHOD_LABEL[p.payments[0].method] : "",
      p.payments[0] ? formatDateTimeBR(p.payments[0].paidAt, tz) : "",
    ]
      .map(esc)
      .join(";"),
  );
  // BOM para o Excel abrir UTF-8 corretamente; ";" como separador (pt-BR).
  const csv = "﻿" + [header.map(esc).join(";"), ...lines, ...saleLines].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="financeiro-${month}.csv"`,
    },
  });
}
