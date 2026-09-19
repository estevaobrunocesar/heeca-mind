import type { Metadata } from "next";
import Link from "next/link";
import type { FollowUpStatus } from "@/generated/prisma/enums";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { ACTIVE_STATUSES } from "@/lib/availability-data";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { formatDateBR } from "@/lib/time";
import { FOLLOW_UP_LABEL } from "@/lib/validation/patient";

export const metadata: Metadata = { title: "Pacientes" };

const STATUS_CLS: Record<FollowUpStatus, string> = {
  ACTIVE: "bg-primary-soft text-primary",
  PAUSED: "bg-warning/15 text-warning",
  DISCHARGED: "bg-surface-muted text-text",
  INACTIVE: "bg-surface-muted text-text-muted",
};

function parseStatus(v: unknown): FollowUpStatus | "DELETED" | null {
  if (v === "ACTIVE" || v === "PAUSED" || v === "DISCHARGED" || v === "INACTIVE" || v === "DELETED") return v;
  return null;
}

export default async function PatientsPage({ searchParams }: PageProps<"/pacientes">) {
  const sp = await searchParams;
  const actor = await requireActor();
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = parseStatus(sp.status);
  const deletedNotice = sp.deleted === "1";

  const org = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId }, select: { timezone: true } });
  const now = new Date();

  const patients = await db.patient.findMany({
    where: {
      organizationId: actor.organizationId,
      deletedAt: status === "DELETED" ? { not: null } : null,
      ...(status && status !== "DELETED" ? { followUpStatus: status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { whatsapp: { contains: q.replace(/\D/g, "") || q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      whatsapp: true,
      followUpStatus: true,
      usualModality: true,
      appointments: {
        where: { status: { in: [...ACTIVE_STATUSES, "COMPLETED"] } },
        orderBy: { startsAt: "asc" },
        select: { startsAt: true, status: true },
      },
    },
  });

  const rows = patients.map((p) => {
    const past = p.appointments.filter((a) => a.startsAt <= now);
    const next = p.appointments.find((a) => a.startsAt > now && ACTIVE_STATUSES.includes(a.status as (typeof ACTIVE_STATUSES)[number]));
    return { ...p, last: past.at(-1)?.startsAt ?? null, next: next?.startsAt ?? null, total: past.filter((a) => a.status === "COMPLETED").length };
  });

  const chip = (href: string, label: string, active: boolean) => (
    <Link key={href} href={href} className={`rounded-md px-3 py-1.5 text-sm ${active ? "bg-surface font-medium shadow-sm" : "text-text-muted hover:text-text"}`}>
      {label}
    </Link>
  );
  const link = (s?: string) => `/pacientes${s ? `?status=${s}` : ""}${q ? `${s ? "&" : "?"}q=${encodeURIComponent(q)}` : ""}`;

  return (
    <>
      <PageHeader
        title="Pacientes"
        description="Cadastro administrativo: contato, acompanhamento e histórico de sessões."
        actions={
          <Link href="/pacientes/novo" className="btn-primary">
            Novo paciente
          </Link>
        }
      />

      {deletedNotice && (
        <div role="status" className="mb-4 rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          Paciente excluído. O histórico fica preservado pelo prazo de retenção; você pode restaurá-lo no filtro “Excluídos”.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <form className="flex gap-2" action="/pacientes" method="get">
          {status && <input type="hidden" name="status" value={status} />}
          <input name="q" defaultValue={q} placeholder="Buscar por nome, WhatsApp ou e-mail" className="input w-72" />
          <button type="submit" className="btn-ghost">
            Buscar
          </button>
        </form>
        <div className="flex flex-wrap rounded-lg bg-surface-muted p-1">
          {chip(link(), "Todos", !status)}
          {chip(link("ACTIVE"), "Em acompanhamento", status === "ACTIVE")}
          {chip(link("PAUSED"), "Pausados", status === "PAUSED")}
          {chip(link("DISCHARGED"), "Alta", status === "DISCHARGED")}
          {chip(link("DELETED"), "Excluídos", status === "DELETED")}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={q ? "Nenhum resultado" : "Nenhum paciente"}
          description={q ? "Tente outro nome ou número." : "Pacientes são criados automaticamente ao agendar, ou manualmente aqui."}
        />
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-2">Paciente</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Sessões</th>
                <th className="px-4 py-2">Último</th>
                <th className="px-4 py-2">Próximo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-surface-muted/50">
                  <td className="px-4 py-2">
                    <Link href={`/pacientes/${p.id}`} className="font-medium hover:text-primary hover:underline">
                      {p.name}
                    </Link>
                    <span className="block text-xs text-text-muted">{p.whatsapp}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[p.followUpStatus]}`}>{FOLLOW_UP_LABEL[p.followUpStatus]}</span>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{p.total}</td>
                  <td className="px-4 py-2 text-text-muted">{p.last ? formatDateBR(p.last, org.timezone) : "—"}</td>
                  <td className="px-4 py-2">{p.next ? formatDateBR(p.next, org.timezone) : <span className="text-text-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
