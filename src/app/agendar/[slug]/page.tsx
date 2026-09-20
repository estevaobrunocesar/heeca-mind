import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatRegistration } from "@/lib/registration";

/**
 * Página pública do profissional. Mobile-first, sem autenticação.
 *
 * Só campos explicitamente públicos saem daqui: o `select` abaixo é a lista
 * exaustiva. Nunca use `include` ou retorne o objeto Professional inteiro
 * nesta rota.
 */
async function getPublicProfile(slug: string) {
  return db.professional.findFirst({
    where: { slug, isActive: true },
    select: {
      displayName: true,
      registrationKind: true,
      registrationNumber: true,
      showRegistration: true,
      photoUrl: true,
      bio: true,
      approaches: true,
      specialties: true,
      whatsapp: true,
      instagram: true,
      website: true,
      addressCity: true,
      addressState: true,
      showPrices: true,
      services: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, description: true, durationMinutes: true, priceCents: true, modality: true },
      },
      policy: { select: { cancellationPolicy: true, reschedulePolicy: true } },
      organization: { select: { type: true, name: true, logoUrl: true } },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/agendar/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublicProfile(slug);
  return { title: p ? `Agendar com ${p.displayName}` : "Profissional não encontrado" };
}

const MODALITY_LABEL = { IN_PERSON: "Presencial", ONLINE: "Online", HYBRID: "Presencial ou online" } as const;

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function PublicBookingPage({ params }: PageProps<"/agendar/[slug]">) {
  const { slug } = await params;
  const p = await getPublicProfile(slug);
  if (!p) notFound();

  const location = [p.addressCity, p.addressState].filter(Boolean).join(" · ");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      <header className="flex flex-col items-center text-center">
        {p.organization.type === "CLINIC" && p.organization.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.organization.logoUrl} alt={p.organization.name} className="mb-5 max-h-16 max-w-[220px] object-contain" />
        )}
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrl} alt="" className="h-24 w-24 rounded-full object-cover" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary-soft text-2xl font-semibold text-primary">
            {p.displayName.charAt(0)}
          </div>
        )}
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{p.displayName}</h1>
        {formatRegistration(p) && <p className="text-sm text-text-muted">{formatRegistration(p)}</p>}
        {location && <p className="mt-1 text-sm text-text-muted">{location}</p>}
      </header>

      {p.bio && <p className="mt-6 text-sm leading-relaxed text-text">{p.bio}</p>}

      {(p.approaches.length > 0 || p.specialties.length > 0) && (
        <section className="mt-6 flex flex-wrap gap-2">
          {[...p.approaches, ...p.specialties].map((tag) => (
            <span key={tag} className="rounded-full bg-surface-muted px-3 py-1 text-xs text-text-muted">
              {tag}
            </span>
          ))}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Atendimentos</h2>
        {p.services.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum atendimento disponível para agendamento no momento.</p>
        ) : (
          <ul className="space-y-3">
            {p.services.map((s) => (
              <li key={s.id}>
                <Link href={`/agendar/${slug}/${s.id}`} className="card block p-4 transition hover:border-primary/50 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{s.name}</p>
                      {s.description && <p className="mt-1 text-sm text-text-muted">{s.description}</p>}
                      <p className="mt-2 text-xs text-text-muted">
                        {s.durationMinutes} min · {MODALITY_LABEL[s.modality]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {p.showPrices && <p className="text-sm font-medium">{formatBRL(s.priceCents)}</p>}
                      <p className="mt-1 text-xs text-primary">Agendar →</p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(p.policy?.cancellationPolicy || p.policy?.reschedulePolicy) && (
        <section className="mt-8 space-y-3 rounded-lg bg-surface-muted p-4 text-xs text-text-muted">
          {p.policy.cancellationPolicy && (
            <div>
              <p className="mb-1 font-medium text-text">Política de cancelamento</p>
              <p>{p.policy.cancellationPolicy}</p>
            </div>
          )}
          {p.policy.reschedulePolicy && (
            <div>
              <p className="mb-1 font-medium text-text">Reagendamento</p>
              <p>{p.policy.reschedulePolicy}</p>
            </div>
          )}
        </section>
      )}

      {p.whatsapp && (
        <a
          href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost mt-8 w-full"
        >
          Falar no WhatsApp
        </a>
      )}
      <p className="mt-6 text-center text-sm text-text-muted">
        Já é paciente?{" "}
        <Link href={`/portal/${slug}`} className="text-primary hover:underline">
          Acesse seu portal
        </Link>
      </p>
    </main>
  );
}
