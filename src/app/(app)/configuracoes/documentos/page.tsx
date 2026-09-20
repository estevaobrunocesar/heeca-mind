import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { TemplateList, type TemplateRow } from "./template-editor";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsSettingsPage() {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId || !canEditProfessional(actor, professionalId)) {
    return <EmptyState title="Só o profissional (ou o responsável pela clínica) edita documentos" description="Escolha um profissional no seletor do cabeçalho." />;
  }
  const templates = await db.documentTemplate.findMany({
    where: { professionalId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { requests: true } }, requests: { where: { status: "ACCEPTED" }, select: { id: true } } },
  });
  const rows: TemplateRow[] = templates.map((t) => ({ id: t.id, kind: t.kind, title: t.title, body: t.body, version: t.version, requireBeforeFirstSession: t.requireBeforeFirstSession, isActive: t.isActive, sent: t._count.requests, accepted: t.requests.length }));
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-text-muted">
        Termos de consentimento, contratos, políticas e autorizações que o paciente lê e aceita pelo WhatsApp. <strong>Administrativos</strong>: registram o que a pessoa aceitou, nunca conteúdo clínico. Cada
        aceite guarda data, hora, versão, nome e um hash do texto exato.
      </p>
      <TemplateList rows={rows} />
    </div>
  );
}
