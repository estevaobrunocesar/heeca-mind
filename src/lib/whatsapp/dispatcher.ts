import "server-only";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { cancelQueuedNotifications, enqueueAppointmentNotification, scheduleReminder } from "@/lib/notifications";
import { syncWaitlistForAppointment, syncWaitlistOffers } from "@/lib/waitlist";
import { autoSendFirstSessionForms, expireFormRequests } from "@/lib/forms";
import { notifyProfessional } from "@/lib/pro-notify";
import { getWhatsAppProvider } from "./notify";
import { getEmailProvider } from "@/lib/email";
import type { EmailProvider } from "@/lib/email";
import type { WhatsAppProvider } from "./provider";
import { parseButtonPayload, parseReply, replyTextFrom, type ButtonIntent } from "./replies";
import { renderReference, templateTypeByName, type WhatsAppPayload } from "./templates";
import type { MessageEvent, StatusEvent } from "./inbound";
import { purgeRateLimits } from "@/lib/rate-limit";
import { anonymizeExpiredPatients, purgeOldWebhookEvents } from "@/lib/lgpd/anonymize";
import { purgeStaleMfaVerifications } from "@/lib/mfa/service";
import { purgeSessions } from "@/lib/sessions";
import { expirePurchases } from "@/lib/packages/service";

/**
 * Rotinas periódicas do WhatsApp. Chamadas pelo cron (src/app/api/cron) a
 * cada minuto, ou manualmente por `npm run cron`.
 *
 * Todas são idempotentes e seguras para rodar em paralelo entre instâncias:
 * o "claim" de cada notificação é um UPDATE condicional (status QUEUED ->
 * SENDING) — quem ganhar a corrida envia, o outro não vê a linha.
 */

const MAX_ATTEMPTS = 5;
const BATCH = 50;

/** Backoff: 1, 2, 4, 8, 16 minutos. */
function nextRetry(attempts: number): Date {
  return new Date(Date.now() + 2 ** (attempts - 1) * 60_000);
}

type EmailPayload = { subject: string; text: string; html?: string };

const NOT_ACTIVE_TYPES = new Set(["REMINDER_24H", "REMINDER_2H", "SESSION_LINK"]);

/** Envia as notificações vencidas. Retorna contagem por resultado. */
export async function dispatchQueued(provider: WhatsAppProvider = getWhatsAppProvider(), email: EmailProvider = getEmailProvider()) {
  const due = await db.notification.findMany({
    where: { status: "QUEUED", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH,
    select: { id: true },
  });

  const result = { sent: 0, failed: 0, retried: 0, skipped: 0 };

  for (const { id } of due) {
    // Claim atômico: só uma instância pega cada linha.
    const claimed = await db.notification.updateMany({
      where: { id, status: "QUEUED" },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) {
      result.skipped++;
      continue;
    }

    const n = await db.notification.findUniqueOrThrow({
      where: { id },
      include: { appointment: { select: { status: true } }, organization: { select: { name: true } } },
    });

    // Lembrete/link de sessão que não está mais ativa: não envia.
    if (NOT_ACTIVE_TYPES.has(n.type) && n.appointment && !["CONFIRMED", "AWAITING_PAYMENT"].includes(n.appointment.status)) {
      await db.notification.update({ where: { id }, data: { status: "FAILED", error: `sessão em ${n.appointment.status}` } });
      result.skipped++;
      continue;
    }

    let res: { ok: true; providerMessageId?: string; skipped?: boolean; reason?: string } | { ok: false; error: string; retryable: boolean };
    if (n.channel === "EMAIL") {
      const p = n.payload as EmailPayload;
      res = await email.send({ to: n.recipient, subject: p.subject, text: p.text, html: p.html });
    } else {
      const payload = n.payload as WhatsAppPayload;
      const type = templateTypeByName(n.templateName ?? "");
      res = await provider.sendTemplate({
        to: n.recipient,
        templateName: n.templateName ?? "",
        bodyVariables: payload.bodyVariables,
        buttons: payload.buttons,
        body: type ? renderReference(type, payload.bodyVariables) : payload.bodyVariables.join(" · "),
        tenantId: n.organizationId,
        tenantName: n.organization.name,
        ref: n.id,
      });
    }

    if (res.ok && res.skipped) {
      // Opt-out ou cota: o Notify não vai entregar; não é erro nosso nem vale retry.
      await db.notification.update({ where: { id }, data: { status: "FAILED", error: res.reason ?? "ignorada pelo Notify" } });
      result.skipped++;
    } else if (res.ok) {
      await db.notification.update({
        where: { id },
        data: { status: "SENT", sentAt: new Date(), providerMessageId: res.providerMessageId, error: null },
      });
      result.sent++;
    } else if (res.retryable && n.attempts < MAX_ATTEMPTS) {
      await db.notification.update({
        where: { id },
        data: { status: "QUEUED", scheduledFor: nextRetry(n.attempts), error: res.error },
      });
      result.retried++;
    } else {
      await db.notification.update({ where: { id }, data: { status: "FAILED", error: res.error } });
      result.failed++;
    }
  }
  return result;
}

/**
 * Solicitações públicas sem confirmação dentro do prazo do profissional
 * viram EXPIRED e liberam o horário. Também expira o que já passou.
 */
export async function expirePendingBookings() {
  const candidates = await db.appointment.findMany({
    where: { status: "AWAITING_CONFIRMATION", source: { in: ["PUBLIC_PAGE", "WAITLIST"] } },
    select: {
      id: true,
      organizationId: true,
      createdAt: true,
      startsAt: true,
      professional: { select: { scheduleSettings: { select: { confirmationTimeoutHours: true } } } },
    },
  });

  const now = Date.now();
  let expired = 0;
  for (const a of candidates) {
    const hours = a.professional.scheduleSettings?.confirmationTimeoutHours ?? 24;
    const deadline = a.createdAt.getTime() + hours * 60 * 60 * 1000;
    if (now < deadline && a.startsAt.getTime() > now) continue;

    const r = await db.appointment.updateMany({
      where: { id: a.id, status: "AWAITING_CONFIRMATION" },
      data: { status: "EXPIRED", cancelledAt: new Date(), cancelReason: `Não confirmado em ${hours}h` },
    });
    if (r.count === 0) continue;
    await cancelQueuedNotifications(a.id);
    await audit(null, { organizationId: a.organizationId, action: "appointment.expire", entityType: "Appointment", entityId: a.id });
    await syncWaitlistForAppointment(a.id);
    expired++;
  }
  return { expired };
}

// ──────────────────────────────────────────────────────────────
// Webhook: status de entrega e respostas do paciente
// ──────────────────────────────────────────────────────────────


/** Processa eventos brutos ainda não tratados. */
export async function processWebhookEvents() {
  const events = await db.whatsAppWebhookEvent.findMany({
    where: { processedAt: null },
    orderBy: { receivedAt: "asc" },
    take: BATCH,
  });

  const result = { statuses: 0, replies: 0, ignored: 0, errors: 0 };
  for (const ev of events) {
    try {
      if (ev.eventId?.startsWith("status:")) {
        await applyStatus(ev.payload as StatusEvent);
        result.statuses++;
      } else if (ev.eventId?.startsWith("message:")) {
        const handled = await applyReply(ev.payload as MessageEvent);
        if (handled) result.replies++;
        else result.ignored++;
      } else {
        result.ignored++;
      }
      await db.whatsAppWebhookEvent.update({ where: { id: ev.id }, data: { processedAt: new Date(), error: null } });
    } catch (err) {
      result.errors++;
      await db.whatsAppWebhookEvent.update({
        where: { id: ev.id },
        data: { processedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  return result;
}

async function applyStatus(s: StatusEvent) {
  const map: Record<string, { status: "SENT" | "DELIVERED" | "READ" | "FAILED"; field?: "deliveredAt" | "readAt" }> = {
    sent: { status: "SENT" },
    delivered: { status: "DELIVERED", field: "deliveredAt" },
    read: { status: "READ", field: "readAt" },
    failed: { status: "FAILED" },
  };
  const m = map[s.status];
  if (!m) return;
  const at = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
  const error = s.status === "failed" ? (s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? "falha na entrega") : undefined;

  // Não regride: READ não volta a DELIVERED se os eventos chegarem fora de ordem.
  const rank = { QUEUED: 0, SENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 } as const;
  const current = await db.notification.findUnique({ where: { providerMessageId: s.id }, select: { id: true, status: true, organizationId: true } });
  if (!current) return;
  // Callback do Notify traz tenantId/ref da mensagem de origem: divergência = evento de outro lugar, ignorar.
  if ((s.tenantId && s.tenantId !== current.organizationId) || (s.ref && s.ref !== current.id)) return;
  if (m.status !== "FAILED" && rank[current.status] >= rank[m.status]) return;

  await db.notification.update({
    where: { id: current.id },
    data: { status: m.status, ...(m.field ? { [m.field]: at } : {}), ...(error ? { error } : {}) },
  });
}

/**
 * Resposta do paciente. Aceita texto livre ("sim", "confirmar") ou o clique
 * num botão de resposta rápida. Age sobre a solicitação mais recente ainda
 * aguardando confirmação para aquele número.
 */
async function applyReply(m: MessageEvent): Promise<boolean> {
  const text = replyTextFrom(m);
  const whatsapp = `+${m.from.replace(/\D/g, "")}`;
  const select = { id: true, organizationId: true, status: true, startsAt: true, source: true, professional: { select: { scheduleSettings: { select: { minCancelHours: true } } } } } as const;

  // 1) Botão com token (templates.ts): acerta exatamente a sessão da mensagem — e o telefone tem
  //    que ser o do paciente dela. Protege contra token vazado e contra duas pendentes do mesmo número.
  const button = parseButtonPayload(text);
  let intent: ButtonIntent;
  let target;
  if (button) {
    const a = await db.appointment.findFirst({ where: { confirmationToken: button.token, patient: { whatsapp }, startsAt: { gt: new Date() } }, select });
    if (!a) return false;
    if (m.tenantId && m.tenantId !== a.organizationId) return false;
    if (button.intent === "confirm" ? a.status !== "AWAITING_CONFIRMATION" : !["AWAITING_CONFIRMATION", "CONFIRMED"].includes(a.status)) return false;
    intent = button.intent;
    target = a;
  } else {
    // 2) Texto livre ("sim", "não"): a solicitação mais recente ainda em aberto daquele número.
    const parsed = parseReply(text);
    if (!parsed) return false;
    intent = parsed === "yes" ? "confirm" : "cancel";
    const a = await db.appointment.findFirst({
      where: { patient: { whatsapp }, startsAt: { gt: new Date() }, status: intent === "confirm" ? "AWAITING_CONFIRMATION" : { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      select,
    });
    if (!a) return false;
    target = a;
  }

  if (intent === "confirm") {
    await db.appointment.update({ where: { id: target.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await audit(null, { organizationId: target.organizationId, action: "appointment.confirm", entityType: "Appointment", entityId: target.id, after: { by: "whatsapp_reply", text } });
    await enqueueAppointmentNotification(target.id, "BOOKING_CONFIRMED");
    await scheduleReminder(target.id, target.startsAt);
    await syncWaitlistForAppointment(target.id);
    if (target.source !== "WAITLIST") await notifyProfessional({ event: "BOOKING_CONFIRMED", appointmentId: target.id, by: "whatsapp" });
    return true;
  }

  const minHours = target.professional.scheduleSettings?.minCancelHours ?? 24;
  // "Remarcar" nunca cancela: vira pedido para o profissional decidir. Cancelar fora do prazo idem.
  if (intent === "reschedule" || Date.now() > target.startsAt.getTime() - minHours * 3_600_000) {
    // Fora do prazo: registra o pedido para o profissional decidir, sem cancelar.
    await db.appointment.update({ where: { id: target.id }, data: { status: "RESCHEDULE_REQUESTED" } });
    await audit(null, { organizationId: target.organizationId, action: "appointment.reschedule_requested", entityType: "Appointment", entityId: target.id, after: { by: "whatsapp_reply", text } });
    await notifyProfessional({ event: "RESCHEDULE_REQUESTED", appointmentId: target.id });
    return true;
  }

  await db.appointment.update({
    where: { id: target.id },
    data: { status: "CANCELLED_BY_PATIENT", cancelledAt: new Date(), cancelReason: "Cancelado pelo paciente via WhatsApp" },
  });
  await audit(null, { organizationId: target.organizationId, action: "appointment.cancel_by_patient", entityType: "Appointment", entityId: target.id, after: { by: "whatsapp_reply", text } });
  await cancelQueuedNotifications(target.id);
  await enqueueAppointmentNotification(target.id, "CANCELLATION");
  await syncWaitlistForAppointment(target.id);
  if (target.source !== "WAITLIST") await notifyProfessional({ event: "BOOKING_CANCELLED", appointmentId: target.id, by: "whatsapp" });
  return true;
}

/** Executa tudo, na ordem certa: primeiro absorve o webhook, depois expira, depois envia. */
export async function runCron() {
  const webhook = await processWebhookEvents();
  const expiry = await expirePendingBookings();
  const waitlistSynced = await syncWaitlistOffers();
  const forms = { expired: await expireFormRequests(), autoSent: await autoSendFirstSessionForms() };
  const dispatch = await dispatchQueued();
  const purgedRateLimits = await purgeRateLimits();
  const lgpd = await anonymizeExpiredPatients();
  const purgedWebhookEvents = await purgeOldWebhookEvents();
  const packagesExpired = await expirePurchases();
  const purgedMfa = await purgeStaleMfaVerifications();
  const purgedSessions = await purgeSessions();
  return { webhook, expiry, waitlistSynced, forms, dispatch, purgedRateLimits, lgpd, purgedWebhookEvents, packagesExpired, purgedMfa, purgedSessions, at: new Date().toISOString() };
}
