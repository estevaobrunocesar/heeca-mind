import { audit } from "@/lib/audit";
import { statement } from "@/lib/commissions/service";
import { db } from "@/lib/db";
import { canViewCommissions } from "@/lib/permissions";
import { getActor } from "@/lib/session";
import { dateTimeInTz, formatDateBR, formatDateTimeBR, todayCivilAndMonth } from "@/lib/time";

const KIND_LABEL = { PAYMENT: "Pagamento", REVERSAL: "Estorno", ADJUSTMENT: "Ajuste" } as const;

/** CSV do extrato de comissões (Excel pt-BR: `;` + BOM). Auditado. */
export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const professionalId = url.searchParams.get("professional") ?? actor.activeProfessionalId ?? "";
  if (!professionalId || !canViewCommissions(actor, professionalId)) return new Response("Forbidden", { status: 403 });
  const pro = await db.professional.findFirst({ where: { id: professionalId, organizationId: actor.organizationId }, select: { displayName: true, organization: { select: { timezone: true } } } });
  if (!pro) return new Response("Not found", { status: 404 });
  const tz = pro.organization.timezone;
  const monthParam = url.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayCivilAndMonth(new Date(), tz).month;
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const st = await statement(actor, professionalId, { from: dateTimeInTz(`${month}-01`, "00:00", tz), to: dateTimeInTz(`${next}-01`, "00:00", tz) });

  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const header = ["Data", "Profissional", "Tipo", "Origem", "Base", "Comissão", "Fechamento", "Observação"];
  const lines = st.entries.map((e) => [formatDateTimeBR(e.occurredAt, tz), pro.displayName, KIND_LABEL[e.kind], e.appointmentId ? "Sessão" : e.packagePurchaseId ? "Pacote" : "", money(e.baseCents), money(e.amountCents), e.closing ? `até ${formatDateBR(e.closing.periodEnd, "UTC")}` : "em aberto", e.note ?? ""].map(esc).join(";"));
  await audit(actor, { organizationId: actor.organizationId, action: "commission.export", entityType: "Professional", entityId: professionalId, after: { month } });
  const csv = "﻿" + [header.map(esc).join(";"), ...lines].join("\r\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="comissoes-${month}.csv"` } });
}
