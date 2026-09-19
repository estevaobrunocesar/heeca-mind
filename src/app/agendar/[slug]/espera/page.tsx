import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicWaitlistForm } from "./waitlist-form";

export const metadata: Metadata = { title: "Lista de espera" };

/**
 * Página pública: entrar na lista de espera de um profissional. Chega-se aqui
 * pelo fluxo de agendamento quando não há horário. `select` exaustivo, como
 * nas demais rotas sem auth.
 */
export default async function PublicWaitlistPage({ params, searchParams }: PageProps<"/agendar/[slug]/espera">) {
  const { slug } = await params;
  const sp = await searchParams;
  const serviceParam = typeof sp.serviceId === "string" ? sp.serviceId : null;

  const p = await db.professional.findFirst({
    where: { slug, isActive: true },
    select: {
      displayName: true,
      services: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, modality: true } },
    },
  });
  if (!p || p.services.length === 0) notFound();

  const chosen = p.services.find((s) => s.id === serviceParam) ?? null;
  const hybrid = chosen ? chosen.modality === "HYBRID" : p.services.some((s) => s.modality === "HYBRID");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <Link href={`/agendar/${slug}`} className="text-sm text-text-muted hover:text-primary">
        ← {p.displayName}
      </Link>
      <header className="mt-3">
        <h1 className="text-xl font-semibold">Lista de espera</h1>
        <p className="mt-1 text-sm text-text-muted">
          Não encontrou um horário? Deixe suas preferências. Quando vagar um horário compatível, {p.displayName} envia um link pelo WhatsApp para você
          confirmar — o horário fica reservado para você por algumas horas.
        </p>
      </header>
      <div className="mt-5">
        <PublicWaitlistForm slug={slug} services={p.services.map((s) => ({ value: s.id, label: s.name }))} defaultServiceId={chosen?.id ?? null} hybrid={hybrid} />
      </div>
    </main>
  );
}
