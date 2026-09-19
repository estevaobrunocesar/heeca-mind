import { STATUS_LABEL } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { canDeletePatient } from "@/lib/permissions";
import { getActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";
import { FOLLOW_UP_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/validation/patient";
import { audit } from "@/lib/audit";

/**
 * Exportação dos dados do titular (LGPD art. 18, II e V — acesso e
 * portabilidade). JSON legível, só dados administrativos e financeiros.
 * Dados clínicos, quando existirem, terão exportação própria com o controle
 * de acesso do módulo clínico.
 */
export async function GET(_req: Request, ctx: RouteContext<"/pacientes/[id]/export">) {
  const { id } = await ctx.params;
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!canDeletePatient(actor)) return new Response("Forbidden", { status: 403 });

  const p = await db.patient.findFirst({
    where: { id, organizationId: actor.organizationId },
    include: {
      organization: { select: { name: true, timezone: true, retentionYears: true } },
      appointments: {
        orderBy: { startsAt: "asc" },
        include: { payments: { orderBy: { paidAt: "asc" } }, professional: { select: { displayName: true, crp: true } } },
      },
      notifications: { orderBy: { createdAt: "asc" }, select: { type: true, status: true, channel: true, sentAt: true, deliveredAt: true, readAt: true } },
    },
  });
  if (!p) return new Response("Not found", { status: 404 });

  const tz = p.organization.timezone;
  const fmt = (d: Date | null) => (d ? formatDateTimeBR(d, tz) : null);

  const data = {
    exportadoEm: fmt(new Date()),
    controlador: p.organization.name,
    politicaDeRetencaoAnos: p.organization.retentionYears,
    titular: {
      nome: p.name,
      whatsapp: p.whatsapp,
      email: p.email,
      statusAcompanhamento: FOLLOW_UP_LABEL[p.followUpStatus],
      modalidadeHabitual: p.usualModality,
      formaPagamentoHabitual: p.preferredPaymentMethod ? PAYMENT_METHOD_LABEL[p.preferredPaymentMethod] : null,
      precisaRecibo: p.needsReceipt,
      melhorHorarioContato: p.bestContactTime,
      observacoesAdministrativas: p.adminNotes,
      consentimentoLgpdEm: fmt(p.lgpdConsentAt),
      primeiroAgendamentoEm: fmt(p.firstAppointmentAt),
      cadastradoEm: fmt(p.createdAt),
      excluidoEm: fmt(p.deletedAt),
      anonimizadoEm: fmt(p.anonymizedAt),
    },
    sessoes: p.appointments.map((a) => ({
      inicio: fmt(a.startsAt),
      fim: fmt(a.endsAt),
      profissional: a.professional.displayName,
      crp: a.professional.crp,
      atendimento: a.serviceNameSnapshot,
      modalidade: a.modality === "ONLINE" ? "Online" : "Presencial",
      status: STATUS_LABEL[a.status],
      origem: a.source,
      valorReais: a.priceCents / 100,
      pagamento: a.paymentStatus,
      observacaoDoPaciente: a.patientNote,
      observacaoAdministrativa: a.adminNote,
      pagamentos: a.payments.map((pay) => ({ em: fmt(pay.paidAt), valorReais: pay.amountCents / 100, forma: PAYMENT_METHOD_LABEL[pay.method], observacao: pay.note })),
    })),
    mensagens: p.notifications.map((n) => ({ tipo: n.type, canal: n.channel, status: n.status, enviadaEm: fmt(n.sentAt), entregueEm: fmt(n.deliveredAt), lidaEm: fmt(n.readAt) })),
  };

  await audit(actor, { organizationId: actor.organizationId, action: "patient.export", entityType: "Patient", entityId: id });

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dados-titular-${id}.json"`,
    },
  });
}
