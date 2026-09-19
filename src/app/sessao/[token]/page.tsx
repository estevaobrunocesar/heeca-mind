import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTimeBR } from "@/lib/time";

export const metadata: Metadata = { title: "Sessão online" };

/**
 * Destino do botão "acessar" da mensagem SESSION_LINK. A URL cadastrada na
 * Meta é fixa (app/sessao/) + token; daqui redirecionamos para a sala real,
 * que pode mudar por sessão sem precisar de novo template.
 */
export default async function SessionPage({ params }: PageProps<"/sessao/[token]">) {
  const { token } = await params;
  if (token.length < 20) notFound();

  const a = await db.appointment.findUnique({
    where: { confirmationToken: token },
    select: {
      status: true,
      startsAt: true,
      modality: true,
      onlineLink: true,
      professional: { select: { displayName: true, onlineFixedLink: true, whatsapp: true, organization: { select: { timezone: true } } } },
      patient: { select: { name: true } },
    },
  });
  if (!a || a.modality !== "ONLINE") notFound();

  const link = a.onlineLink ?? a.professional.onlineFixedLink;
  if (link && a.status === "CONFIRMED") redirect(link);

  const tz = a.professional.organization.timezone;
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">Olá, {a.patient.name.split(" ")[0]}!</h1>
      <p className="mt-2 text-sm text-text-muted">
        {a.status !== "CONFIRMED"
          ? "Esta sessão não está mais ativa."
          : `O link da sala ainda não foi definido para a sessão de ${formatDateTimeBR(a.startsAt, tz)}.`}
      </p>
      {a.professional.whatsapp && (
        <a
          href={`https://wa.me/${a.professional.whatsapp.replace(/\D/g, "")}`}
          className="btn-primary mt-6"
          target="_blank"
          rel="noreferrer"
        >
          Falar com {a.professional.displayName}
        </a>
      )}
    </main>
  );
}
