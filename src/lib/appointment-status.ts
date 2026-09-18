import type { AppointmentStatus } from "@/generated/prisma/enums";

/**
 * Máquina de estados do agendamento.
 *
 * Ações do profissional/recepção na agenda. Cada ação lista os status de
 * origem permitidos. Transições fora da tabela são rejeitadas no servidor,
 * independentemente do que a UI mostre.
 */

export type AppointmentAction =
  | "confirm" // -> CONFIRMED
  | "request_confirmation" // -> AWAITING_CONFIRMATION (envia WhatsApp)
  | "cancel_by_professional" // -> CANCELLED_BY_PROFESSIONAL
  | "cancel_by_patient" // -> CANCELLED_BY_PATIENT (registrado pela recepção)
  | "complete" // -> COMPLETED
  | "no_show" // -> NO_SHOW
  | "reschedule"; // -> CONFIRMED em novo horário

const TRANSITIONS: Record<AppointmentAction, { from: AppointmentStatus[]; to: AppointmentStatus }> = {
  confirm: {
    from: ["PENDING", "AWAITING_CONFIRMATION", "RESCHEDULE_REQUESTED", "AWAITING_PAYMENT"],
    to: "CONFIRMED",
  },
  request_confirmation: { from: ["PENDING"], to: "AWAITING_CONFIRMATION" },
  cancel_by_professional: {
    from: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED", "AWAITING_PAYMENT"],
    to: "CANCELLED_BY_PROFESSIONAL",
  },
  cancel_by_patient: {
    from: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED", "AWAITING_PAYMENT"],
    to: "CANCELLED_BY_PATIENT",
  },
  complete: { from: ["CONFIRMED", "PENDING", "AWAITING_CONFIRMATION"], to: "COMPLETED" },
  no_show: { from: ["CONFIRMED", "PENDING", "AWAITING_CONFIRMATION"], to: "NO_SHOW" },
  reschedule: {
    from: ["PENDING", "AWAITING_CONFIRMATION", "CONFIRMED", "RESCHEDULE_REQUESTED"],
    to: "CONFIRMED",
  },
};

export function canTransition(from: AppointmentStatus, action: AppointmentAction): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export function targetStatus(action: AppointmentAction): AppointmentStatus {
  return TRANSITIONS[action].to;
}

export function availableActions(status: AppointmentStatus): AppointmentAction[] {
  return (Object.keys(TRANSITIONS) as AppointmentAction[]).filter((a) => canTransition(status, a));
}

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "Pendente",
  AWAITING_CONFIRMATION: "Aguardando confirmação",
  CONFIRMED: "Confirmado",
  CANCELLED_BY_PATIENT: "Cancelado pelo paciente",
  CANCELLED_BY_PROFESSIONAL: "Cancelado pelo profissional",
  RESCHEDULE_REQUESTED: "Reagendamento solicitado",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
  AWAITING_PAYMENT: "Aguardando pagamento",
};

/** Classe de cor por status — usada nos chips da agenda. */
export const STATUS_TONE: Record<AppointmentStatus, "neutral" | "warning" | "success" | "danger" | "muted"> = {
  PENDING: "warning",
  AWAITING_CONFIRMATION: "warning",
  CONFIRMED: "success",
  CANCELLED_BY_PATIENT: "muted",
  CANCELLED_BY_PROFESSIONAL: "muted",
  RESCHEDULE_REQUESTED: "warning",
  COMPLETED: "neutral",
  NO_SHOW: "danger",
  AWAITING_PAYMENT: "warning",
};

export const TERMINAL_STATUSES: AppointmentStatus[] = [
  "CANCELLED_BY_PATIENT",
  "CANCELLED_BY_PROFESSIONAL",
  "COMPLETED",
  "NO_SHOW",
];
