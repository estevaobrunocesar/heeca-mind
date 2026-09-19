import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { requireActor } from "@/lib/session";
import { ServiceRowActions } from "./service-row-actions";

export const metadata: Metadata = { title: "Serviços" };

const MODALITY_LABEL = { IN_PERSON: "Presencial", ONLINE: "Online", HYBRID: "Presencial ou online" } as const;

export default async function ServicesPage() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) {
    return (
      <>
        <PageHeader title="Serviços" />
        <EmptyState
          title="Nenhum perfil profissional vinculado"
          description="Sua conta não possui um perfil de psicólogo. Serviços pertencem a um profissional."
        />
      </>
    );
  }

  const services = await db.service.findMany({
    where: { professionalId: actor.activeProfessionalId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Serviços"
        description="Os tipos de atendimento que aparecem na sua página de agendamento, nesta ordem."
        actions={
          <Link href="/servicos/novo" className="btn-primary">
            Novo serviço
          </Link>
        }
      />

      {services.length === 0 ? (
        <EmptyState
          title="Nenhum serviço cadastrado"
          description="Cadastre pelo menos um tipo de atendimento para que pacientes possam agendar pela sua página pública."
        />
      ) : (
        <ul className="space-y-3">
          {services.map((s, i) => (
            <li
              key={s.id}
              className={`card flex items-start justify-between gap-4 p-4 ${s.isActive ? "" : "opacity-60"}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{s.name}</p>
                  {!s.isActive && (
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      Inativo
                    </span>
                  )}
                </div>
                {s.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{s.description}</p>}
                <p className="mt-2 text-xs text-text-muted">
                  {s.durationMinutes} min · {MODALITY_LABEL[s.modality]} ·{" "}
                  <span className="font-medium text-text">{formatBRL(s.priceCents)}</span>
                </p>
              </div>
              <ServiceRowActions
                id={s.id}
                isActive={s.isActive}
                isFirst={i === 0}
                isLast={i === services.length - 1}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
