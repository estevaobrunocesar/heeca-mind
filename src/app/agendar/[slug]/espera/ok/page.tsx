import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Na lista de espera" };

export default async function PublicWaitlistDonePage({ params }: PageProps<"/agendar/[slug]/espera/ok">) {
  const { slug } = await params;
  const p = await db.professional.findFirst({ where: { slug, isActive: true }, select: { displayName: true } });
  if (!p) notFound();
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">✓</div>
      <h1 className="text-xl font-semibold">Você está na lista de espera</h1>
      <p className="mt-2 text-sm text-text-muted">
        Enviamos uma confirmação pelo WhatsApp. Quando surgir um horário compatível, {p.displayName} manda um link para você confirmar. Se preferir, pode
        continuar acompanhando a agenda:
      </p>
      <Link href={`/agendar/${slug}`} className="btn-ghost mt-6 inline-block">
        Ver horários disponíveis
      </Link>
    </main>
  );
}
