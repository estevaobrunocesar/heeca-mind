import "server-only";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "./db";
import { isEventEnabled, normalizePrefs, unsubscribeHint, type ProEvent } from "./pro-notify-prefs";
import { formatDateTimeBR } from "./time";

/**
 * Avisos por e-mail ao profissional.
 *
 * Regras:
 *  - Vai pela fila (Notification, canal EMAIL) — mesmo retry, mesma auditoria,
 *    mesmo painel /mensagens que o WhatsApp. O envio real é o dispatcher.
 *  - Só nome do paciente, título, data e link. NUNCA conteúdo clínico: um
 *    e-mail sai do nosso controle (caixa de terceiros, celular, notificações).
 *  - Respeita User.emailNotifications; profissional sem login não recebe.
 *  - Falhas aqui nunca derrubam a ação principal: chame com .catch.
 */

export type ProEventInput =
  | { event: "BOOKING_REQUESTED"; appointmentId: string }
  | { event: "BOOKING_CONFIRMED"; appointmentId: string; by: "link" | "whatsapp" | "waitlist" }
  | { event: "BOOKING_CANCELLED"; appointmentId: string; by: "link" | "whatsapp" }
  | { event: "RESCHEDULE_REQUESTED"; appointmentId: string }
  | { event: "FORM_SUBMITTED"; formRequestId: string }
  | { event: "WAITLIST_JOINED"; waitlistEntryId: string }
  | { event: "WAITLIST_OFFER_ANSWERED"; waitlistEntryId: string; appointmentId: string; accepted: boolean }
  | { event: "DELEGATION_RECEIVED"; delegationId: string };

const TYPE: Record<ProEvent, NotificationType> = {
  BOOKING_REQUESTED: "PRO_BOOKING_REQUESTED",
  BOOKING_CONFIRMED: "PRO_BOOKING_CONFIRMED",
  BOOKING_CANCELLED: "PRO_BOOKING_CANCELLED",
  RESCHEDULE_REQUESTED: "PRO_RESCHEDULE_REQUESTED",
  FORM_SUBMITTED: "PRO_FORM_SUBMITTED",
  WAITLIST_JOINED: "PRO_WAITLIST_JOINED",
  WAITLIST_OFFER_ANSWERED: "PRO_WAITLIST_OFFER_ANSWERED",
  DELEGATION_RECEIVED: "PRO_DELEGATION_RECEIVED",
};

type Built = { professionalId: string; organizationId: string; patientId?: string; appointmentId?: string; subject: string; lines: string[]; link: string };

const base = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

async function build(input: ProEventInput): Promise<Built | null> {
  switch (input.event) {
    case "BOOKING_REQUESTED":
    case "BOOKING_CONFIRMED":
    case "BOOKING_CANCELLED":
    case "RESCHEDULE_REQUESTED": {
      const a = await db.appointment.findUnique({
        where: { id: input.appointmentId },
        select: { id: true, organizationId: true, professionalId: true, patientId: true, startsAt: true, modality: true, serviceNameSnapshot: true, patient: { select: { name: true } }, organization: { select: { timezone: true } } },
      });
      if (!a) return null;
      const when = `${formatDateTimeBR(a.startsAt, a.organization.timezone)} · ${a.modality === "ONLINE" ? "online" : "presencial"} · ${a.serviceNameSnapshot}`;
      const common = { professionalId: a.professionalId, organizationId: a.organizationId, patientId: a.patientId, appointmentId: a.id, link: `${base()}/agenda/${a.id}` };
      if (input.event === "BOOKING_REQUESTED") return { ...common, subject: `Novo pedido de horário: ${a.patient.name}`, lines: [`${a.patient.name} solicitou uma sessão pela página pública.`, when, "O horário fica reservado até a pessoa confirmar pelo WhatsApp."] };
      if (input.event === "BOOKING_CONFIRMED") return { ...common, subject: `${a.patient.name} confirmou a sessão`, lines: [`${a.patient.name} confirmou ${input.by === "whatsapp" ? "pelo WhatsApp" : input.by === "waitlist" ? "o horário oferecido pela lista de espera" : "pelo link"}.`, when] };
      if (input.event === "BOOKING_CANCELLED") return { ...common, subject: `${a.patient.name} cancelou a sessão`, lines: [`${a.patient.name} cancelou ${input.by === "whatsapp" ? "pelo WhatsApp" : "pelo link"}.`, when, "O horário vagou — veja na sessão se alguém da lista de espera combina."] };
      return { ...common, subject: `${a.patient.name} pede reagendamento`, lines: [`${a.patient.name} respondeu que não poderá comparecer, fora do prazo de cancelamento.`, when, "A sessão ficou como \"reagendamento solicitado\" para você decidir."] };
    }
    case "FORM_SUBMITTED": {
      const r = await db.formRequest.findUnique({
        where: { id: input.formRequestId },
        select: { id: true, organizationId: true, professionalId: true, patientId: true, titleSnapshot: true, dataClass: true, patient: { select: { name: true } } },
      });
      if (!r) return null;
      return {
        professionalId: r.professionalId,
        organizationId: r.organizationId,
        patientId: r.patientId,
        subject: `${r.patient.name} respondeu: ${r.titleSnapshot}`,
        lines: [`${r.patient.name} enviou as respostas de "${r.titleSnapshot}".`, r.dataClass === "CLINICAL" ? "As respostas são clínicas: abra pelo prontuário (cada leitura fica registrada)." : "As respostas estão na ficha do paciente."],
        link: r.dataClass === "CLINICAL" ? `${base()}/pacientes/${r.patientId}/prontuario` : `${base()}/pacientes/${r.patientId}`,
      };
    }
    case "WAITLIST_JOINED": {
      const e = await db.waitlistEntry.findUnique({ where: { id: input.waitlistEntryId }, select: { organizationId: true, professionalId: true, patientId: true, patient: { select: { name: true } } } });
      if (!e) return null;
      return { professionalId: e.professionalId, organizationId: e.organizationId, patientId: e.patientId, subject: `${e.patient.name} entrou na lista de espera`, lines: [`${e.patient.name} entrou na sua lista de espera pela página pública.`, "Quando vagar um horário compatível, ofereça pelo painel."], link: `${base()}/agenda/espera` };
    }
    case "WAITLIST_OFFER_ANSWERED": {
      const e = await db.waitlistEntry.findUnique({ where: { id: input.waitlistEntryId }, select: { organizationId: true, professionalId: true, patientId: true, patient: { select: { name: true } } } });
      const a = await db.appointment.findUnique({ where: { id: input.appointmentId }, select: { startsAt: true, organization: { select: { timezone: true } } } });
      if (!e || !a) return null;
      const when = formatDateTimeBR(a.startsAt, a.organization.timezone);
      return input.accepted
        ? { professionalId: e.professionalId, organizationId: e.organizationId, patientId: e.patientId, appointmentId: input.appointmentId, subject: `${e.patient.name} aceitou o horário oferecido`, lines: [`${e.patient.name} confirmou o horário de ${when} oferecido pela lista de espera.`], link: `${base()}/agenda/${input.appointmentId}` }
        : { professionalId: e.professionalId, organizationId: e.organizationId, patientId: e.patientId, subject: `${e.patient.name} recusou o horário oferecido`, lines: [`${e.patient.name} não ficou com o horário de ${when}. A pessoa continua na lista de espera; o horário voltou a ficar livre.`], link: `${base()}/agenda/espera` };
    }
    case "DELEGATION_RECEIVED": {
      const d = await db.clinicalDelegation.findUnique({
        where: { id: input.delegationId },
        select: { organizationId: true, delegateProfessionalId: true, kind: true, expiresAt: true, patient: { select: { name: true } }, grantor: { select: { displayName: true } }, organization: { select: { timezone: true } } },
      });
      if (!d) return null;
      return {
        professionalId: d.delegateProfessionalId,
        organizationId: d.organizationId,
        subject: `${d.grantor.displayName} delegou um prontuário a você`,
        lines: [`${d.grantor.displayName} concedeu acesso por ${d.kind === "SUPERVISION" ? "supervisão (leitura)" : "substituição (leitura e registro)"} — ${d.patient ? `paciente ${d.patient.name}` : "todos os pacientes"} — até ${formatDateTimeBR(d.expiresAt, d.organization.timezone)}.`],
        link: `${base()}/configuracoes/delegacoes`,
      };
    }
  }
}

function render(b: Built, event: ProEvent, proName: string): { text: string; html: string } {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const text = [`Olá, ${proName}.`, "", ...b.lines, "", `Abrir: ${b.link}`, "", "— Heeca Mind", unsubscribeHint(event)].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">
<p>Olá, ${esc(proName)}.</p>
${b.lines.map((l) => `<p>${esc(l)}</p>`).join("\n")}
<p><a href="${esc(b.link)}" style="display:inline-block;background:#3f6b4e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Abrir no Heeca Mind</a></p>
<p style="color:#777;font-size:12px">— Heeca Mind<br>${esc(unsubscribeHint(event))}</p>
</div>`;
  return { text, html };
}

/** Enfileira o aviso (se o profissional tem login e a preferência está ligada). Nunca lança. */
export async function notifyProfessional(input: ProEventInput): Promise<{ queued: boolean; reason?: string }> {
  try {
    const b = await build(input);
    if (!b) return { queued: false, reason: "entidade não encontrada" };
    const pro = await db.professional.findUnique({ where: { id: b.professionalId }, select: { displayName: true, user: { select: { email: true, emailNotifications: true } } } });
    if (!pro?.user) return { queued: false, reason: "profissional sem login" };
    if (!isEventEnabled(normalizePrefs(pro.user.emailNotifications), input.event)) return { queued: false, reason: "preferência desligada" };
    const { text, html } = render(b, input.event, pro.displayName);
    await db.notification.create({
      data: {
        organizationId: b.organizationId,
        appointmentId: b.appointmentId ?? null,
        patientId: b.patientId ?? null,
        channel: "EMAIL",
        type: TYPE[input.event],
        recipient: pro.user.email,
        payload: { subject: b.subject, text, html },
      },
    });
    return { queued: true };
  } catch (e) {
    console.error("[pro-notify]", input.event, (e as Error).message);
    return { queued: false, reason: (e as Error).message };
  }
}
