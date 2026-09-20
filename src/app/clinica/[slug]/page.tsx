import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatRegistration } from "@/lib/registration";

/** Página pública da clínica: lista os profissionais com página de agendamento. Só campos públicos. */
async function load(slug: string) {
  return db.organization.findFirst({
    where: { slug, type: "CLINIC" },
    select: {
      name: true,
      professionals: {
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { slug: true, displayName: true, registrationKind: true, registrationNumber: true, showRegistration: true, photoUrl: true, bio: true, approaches: true, specialties: true, addressCity: true, services: { where: { isActive: true }, select: { modality: true } } },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/clinica/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const org = await load(slug);
  return { title: org ? `Agendar em ${org.name}` : "Clínica não encontrada" };
}

export default async function ClinicPage({ params }: PageProps<"/clinica/[slug]">) {
  const { slug } = await params;
  const org = await load(slug);
  if (!org) notFound();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{org.name}</h1>
        <p className="mt-1 text-sm text-text-muted">Escolha o(a) profissional para ver horários e agendar.</p>
      </header>
      <ul className="mt-6 space-y-3">
        {org.professionals.map((p) => {
          const modalities = new Set(p.services.map((s) => s.modality));
          const mod = modalities.has("HYBRID") || (modalities.has("ONLINE") && modalities.has("IN_PERSON")) ? "Presencial e online" : modalities.has("ONLINE") ? "Online" : modalities.size ? "Presencial" : null;
          return (
            <li key={p.slug}>
              <Link href={`/agendar/${p.slug}`} className="card flex items-center gap-4 p-4 transition hover:border-primary/50 hover:shadow-sm">
                {p.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-lg font-semibold text-primary">{p.displayName.charAt(0)}</div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.displayName}</p>
                  <p className="text-xs text-text-muted">
                    {formatRegistration(p)}
                    {formatRegistration(p) && (mod || p.addressCity) && " · "}
                    {[mod, p.addressCity].filter(Boolean).join(" · ")}
                  </p>
                  {(p.approaches.length > 0 || p.specialties.length > 0) && (
                    <p className="mt-1 truncate text-xs text-text-muted">{[...p.approaches, ...p.specialties].slice(0, 4).join(" · ")}</p>
                  )}
                </div>
                <span className="text-xs text-primary">Agendar →</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {org.professionals.length === 0 && <p className="mt-6 text-center text-sm text-text-muted">Nenhum profissional disponível no momento.</p>}
    </main>
  );
}
