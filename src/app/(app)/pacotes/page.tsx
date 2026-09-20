import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { db } from "@/lib/db";
import { formatBRL } from "@/lib/money";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { PackageRowActions } from "./package-row-actions";

export const metadata: Metadata = { title: "Pacotes" };

export default async function PackagesPage() {
  const actor = await requireActor();
  if (!actor.activeProfessionalId) {
    return (
      <>
        <PageHeader title="Pacotes" />
        <EmptyState title="Nenhum perfil profissional vinculado" description="Pacotes pertencem a um profissional." />
      </>
    );
  }
  const canEdit = canEditProfessional(actor, actor.activeProfessionalId);
  const [packages, services] = await Promise.all([
    db.package.findMany({
      where: { professionalId: actor.activeProfessionalId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { purchases: { where: { status: "ACTIVE" } } } } },
    }),
    db.service.findMany({ where: { professionalId: actor.activeProfessionalId }, select: { id: true, name: true } }),
  ]);
  const serviceName = new Map(services.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader
        title="Pacotes"
        description="Blocos de sessões vendidos ao paciente. Cada sessão concluída (ou falta, conforme sua política) desconta uma do saldo."
        actions={
          canEdit ? (
            <Link href="/pacotes/novo" className="btn-primary">
              Novo pacote
            </Link>
          ) : undefined
        }
      />

      {packages.length === 0 ? (
        <EmptyState title="Nenhum pacote cadastrado" description="Ex.: “Pacote 5 sessões”, 5 sessões, 90 dias de validade. Depois venda na ficha do paciente." />
      ) : (
        <ul className="space-y-3">
          {packages.map((p) => (
            <li key={p.id} className={`card flex items-start justify-between gap-4 p-4 ${p.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{p.name}</p>
                  {!p.isActive && <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">Inativo</span>}
                </div>
                {p.description && <p className="mt-1 line-clamp-2 text-sm text-text-muted">{p.description}</p>}
                <p className="mt-2 text-xs text-text-muted">
                  {p.sessionsCount} sessões · {p.validityDays} dias · <span className="font-medium text-text">{formatBRL(p.priceCents)}</span>
                  {p.sessionsCount > 0 && <span> ({formatBRL(Math.round(p.priceCents / p.sessionsCount))}/sessão)</span>}
                  {" · "}
                  {p.serviceIds.length === 0 ? "qualquer serviço" : p.serviceIds.map((id) => serviceName.get(id) ?? "?").join(", ")}
                  {p._count.purchases > 0 && <span> · {p._count.purchases} ativo(s) com pacientes</span>}
                </p>
              </div>
              {canEdit && <PackageRowActions id={p.id} isActive={p.isActive} />}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
