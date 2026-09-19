import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateBR, slotLabelInTz } from "@/lib/time";

export const metadata: Metadata = { title: "Solicitação recebida" };

/**
 * Página pós-envio. Mostra o resumo, mas NÃO o link de confirmação: ele só
 * vai pelo WhatsApp, o que comprova que o número informado é do paciente.
 */
export default async function BookingRequestedPage({ params, searchParams }: PageProps<"/agendar/[slug]/solicitado">) {
  const { slug } = await params;
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : "";

  const a = await db.appointment.findFirst({
    where: { id, source: "PUBLIC_PAGE", professional: { slug } },
    select: {
      startsAt: true,
      modality: true,
      serviceNameSnapshot: true,
      status: true,
      patient: { select: { name: true, whatsapp: true } },
      professional: { select: { displayName: true, whatsapp: true, organization: { select: { timezone: true } } } },
    },
  });
  if (!a) notFound();

  const tz = a.professional.organization.timezone;
  const masked = a.patient.whatsapp.replace(/^(\+\d{2})(\d{2})\d+(\d{4})$/, "$1 $2 •••••-$3");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">✓</div>
      <h1 className="text-xl font-semibold">Solicitação recebida</h1>
      <p className="mt-2 text-sm text-text-muted">
        Enviamos uma mensagem para <span className="font-medium text-text">{masked}</span>. Toque em <em>confirmar</em> lá para
        garantir o horário.
      </p>

      <div className="card mt-6 p-4 text-left text-sm">
        <p className="font-medium">{a.serviceNameSnapshot}</p>
        <p className="text-text-muted">com {a.professional.displayName}</p>
        <p className="mt-2">
          {formatDateBR(a.startsAt, tz)} às {slotLabelInTz(a.startsAt, tz)} · {a.modality === "ONLINE" ? "Online" : "Presencial"}
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Enquanto não for confirmado, o horário fica reservado por tempo limitado.
        </p>
      </div>

      <p className="mt-6 text-xs text-text-muted">
        Não recebeu a mensagem? Verifique o número ou{" "}
        {a.professional.whatsapp ? (
          <a href={`https://wa.me/${a.professional.whatsapp.replace(/\D/g, "")}`} className="text-primary hover:underline" target="_blank" rel="noreferrer">
            fale diretamente com {a.professional.displayName}
          </a>
        ) : (
          <>entre em contato com {a.professional.displayName}</>
        )}
        .
      </p>
      <Link href={`/agendar/${slug}`} className="mt-4 inline-block text-sm text-text-muted hover:text-primary">
        ← Voltar
      </Link>
    </main>
  );
}
