import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { STATUS_LABEL } from "@/lib/appointment-status";
import { db } from "@/lib/db";
import { formatDateBR, partsInTz, slotLabelInTz, WEEKDAY_LABELS } from "@/lib/time";
import { ConfirmButtons } from "./confirm-buttons";

export const metadata: Metadata = { title: "Confirmar horário" };

/**
 * Destino do botão "confirmar" da mensagem de WhatsApp.
 * Sem login: o token na URL é a credencial. Mostra apenas o administrativo
 * (quem, quando, onde) — nunca observações.
 */
export default async function ConfirmPage({ params }: PageProps<"/confirmar/[token]">) {
  const { token } = await params;
  if (token.length < 20) notFound();

  const a = await db.appointment.findUnique({
    where: { confirmationToken: token },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      modality: true,
      serviceNameSnapshot: true,
      patient: { select: { name: true } },
      professional: {
        select: {
          displayName: true,
          addressLine: true,
          addressCity: true,
          whatsapp: true,
          organization: { select: { timezone: true } },
          policy: { select: { cancellationPolicy: true } },
          scheduleSettings: { select: { minCancelHours: true } },
        },
      },
    },
  });
  if (!a) notFound();

  const tz = a.professional.organization.timezone;
  const weekday = WEEKDAY_LABELS[partsInTz(a.startsAt, tz).weekday];
  const past = a.startsAt < new Date();
  const canConfirm = !past && (a.status === "AWAITING_CONFIRMATION" || a.status === "PENDING");
  const canCancel = !past && ["AWAITING_CONFIRMATION", "PENDING", "CONFIRMED"].includes(a.status);
  const firstName = a.patient.name.split(" ")[0];

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-xl font-semibold">Olá, {firstName}!</h1>
      <p className="mt-1 text-sm text-text-muted">
        {a.status === "CONFIRMED"
          ? "Seu horário está confirmado."
          : canConfirm
            ? "Confirme seu horário para garantir a reserva."
            : `Situação: ${STATUS_LABEL[a.status]}.`}
      </p>

      <div className="card mt-6 p-4 text-sm">
        <p className="font-medium">{a.serviceNameSnapshot}</p>
        <p className="text-text-muted">com {a.professional.displayName}</p>
        <p className="mt-3 text-base font-medium">
          {weekday}, {formatDateBR(a.startsAt, tz)}
        </p>
        <p className="text-text-muted">
          {slotLabelInTz(a.startsAt, tz)}–{slotLabelInTz(a.endsAt, tz)} · {a.modality === "ONLINE" ? "Online" : "Presencial"}
        </p>
        {a.modality === "IN_PERSON" && (a.professional.addressLine || a.professional.addressCity) && (
          <p className="mt-2 text-xs text-text-muted">
            {[a.professional.addressLine, a.professional.addressCity].filter(Boolean).join(" · ")}
          </p>
        )}
        {a.modality === "ONLINE" && (
          <p className="mt-2 text-xs text-text-muted">O link da sessão será enviado por WhatsApp no dia.</p>
        )}
      </div>

      <div className="mt-6">
        <ConfirmButtons token={token} canConfirm={canConfirm} canCancel={canCancel} />
      </div>

      {a.professional.policy?.cancellationPolicy && (
        <p className="mt-6 rounded-lg bg-surface-muted p-3 text-xs text-text-muted">{a.professional.policy.cancellationPolicy}</p>
      )}
      {a.professional.whatsapp && (
        <p className="mt-4 text-center text-xs text-text-muted">
          Precisa de outro horário?{" "}
          <a href={`https://wa.me/${a.professional.whatsapp.replace(/\D/g, "")}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">
            Fale com {a.professional.displayName}
          </a>
        </p>
      )}
    </main>
  );
}
