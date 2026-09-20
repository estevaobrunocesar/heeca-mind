import type { Metadata } from "next";
import Link from "next/link";
import type { NotificationStatus, NotificationType } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Mensagens" };

const TYPE_LABEL: Record<NotificationType, string> = {
  BOOKING_REQUEST: "Pedido de confirmação",
  BOOKING_CONFIRMED: "Confirmação",
  REMINDER_24H: "Lembrete 24h",
  REMINDER_2H: "Lembrete 2h",
  SESSION_LINK: "Link da sessão",
  CANCELLATION: "Cancelamento",
  RESCHEDULE: "Reagendamento",
  WAITLIST_JOINED: "Lista de espera",
  WAITLIST_OFFER: "Oferta de horário",
  FORM_REQUEST: "Formulário",
  DOCUMENT_REQUEST: "Documento",
  PRO_BOOKING_REQUESTED: "Aviso: novo pedido",
  PRO_BOOKING_CONFIRMED: "Aviso: confirmou",
  PRO_BOOKING_CANCELLED: "Aviso: cancelou",
  PRO_RESCHEDULE_REQUESTED: "Aviso: reagendamento",
  PRO_FORM_SUBMITTED: "Aviso: formulário respondido",
  PRO_WAITLIST_JOINED: "Aviso: lista de espera",
  PRO_WAITLIST_OFFER_ANSWERED: "Aviso: resposta a oferta",
  PRO_DELEGATION_RECEIVED: "Aviso: delegação",
  PRO_DOCUMENT_ACCEPTED: "Aviso: documento aceito",
};

const STATUS_UI: Record<NotificationStatus, { label: string; cls: string }> = {
  QUEUED: { label: "Agendada", cls: "bg-surface-muted text-text-muted" },
  SENDING: { label: "Enviando", cls: "bg-warning/15 text-warning" },
  SENT: { label: "Enviada", cls: "bg-primary-soft text-primary" },
  DELIVERED: { label: "Entregue", cls: "bg-primary-soft text-primary" },
  READ: { label: "Lida", cls: "bg-primary text-white" },
  FAILED: { label: "Falhou", cls: "bg-danger-soft text-danger" },
};

function mask(recipient: string) {
  if (recipient.includes("@")) {
    const [u, d] = recipient.split("@");
    return `${u.slice(0, 2)}•••@${d}`;
  }
  return recipient.replace(/^(\+\d{2})(\d{2})\d+(\d{4})$/, "$1 $2 •••••-$3");
}

export default async function MessagesPage({ searchParams }: PageProps<"/mensagens">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const filter = sp.status === "FAILED" || sp.status === "QUEUED" ? sp.status : null;

  const [notifications, counts] = await Promise.all([
    db.notification.findMany({
      where: { organizationId: actor.organizationId, ...(filter ? { status: filter } : {}) },
      orderBy: [{ scheduledFor: "desc" }],
      take: 100,
      select: {
        id: true,
        type: true,
        status: true,
        recipient: true,
        scheduledFor: true,
        sentAt: true,
        deliveredAt: true,
        readAt: true,
        error: true,
        attempts: true,
        appointmentId: true,
        patient: { select: { name: true } },
      },
    }),
    db.notification.groupBy({
      by: ["status"],
      where: { organizationId: actor.organizationId },
      _count: { _all: true },
    }),
  ]);
  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const tz = org.timezone;
  const count = (s: NotificationStatus) => counts.find((c) => c.status === s)?._count._all ?? 0;

  const chip = (href: string, label: string, active: boolean) => (
    <Link href={href} className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-surface font-medium shadow-sm" : "text-text-muted hover:text-text"}`}>
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Mensagens"
        description="Tudo que o sistema enviou (ou vai enviar) aos pacientes por WhatsApp. Só dados administrativos trafegam aqui."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-surface-muted p-1">
          {chip("/mensagens", "Todas", !filter)}
          {chip("/mensagens?status=QUEUED", `Agendadas (${count("QUEUED")})`, filter === "QUEUED")}
          {chip("/mensagens?status=FAILED", `Falhas (${count("FAILED")})`, filter === "FAILED")}
        </div>
        <p className="text-xs text-text-muted">
          Entregues: {count("DELIVERED") + count("READ")} · Lidas: {count("READ")}
        </p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="Nenhuma mensagem" description="As mensagens aparecem aqui quando sessões são solicitadas, confirmadas ou lembradas." />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2">Quando</th>
                <th className="px-4 py-2">Paciente</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Detalhe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {notifications.map((n) => {
                const s = STATUS_UI[n.status];
                const when = n.readAt ?? n.deliveredAt ?? n.sentAt ?? n.scheduledFor;
                return (
                  <tr key={n.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-text-muted">{formatDateTimeBR(when, tz)}</td>
                    <td className="px-4 py-2">
                      {n.appointmentId ? (
                        <Link href={`/agenda/${n.appointmentId}`} className="hover:text-primary hover:underline">
                          {n.patient?.name ?? "—"}
                        </Link>
                      ) : (
                        (n.patient?.name ?? "—")
                      )}
                      <span className="block text-xs text-text-muted">{mask(n.recipient)}</span>
                    </td>
                    <td className="px-4 py-2">{TYPE_LABEL[n.type]}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
                    </td>
                    <td className="max-w-xs px-4 py-2 text-xs text-text-muted">
                      {n.error ?? (n.attempts > 1 ? `${n.attempts} tentativas` : "")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
