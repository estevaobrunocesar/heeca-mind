import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import type { FormField } from "@/lib/forms-schema";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { TemplateList, type TemplateRow } from "./template-editor";

export const metadata: Metadata = { title: "Formulários" };

export default async function FormsSettingsPage() {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId || !canEditProfessional(actor, professionalId)) {
    return <EmptyState title="Só o profissional (ou o responsável pela clínica) edita formulários" description="Escolha um profissional no seletor do cabeçalho." />;
  }
  const templates = await db.formTemplate.findMany({
    where: { professionalId },
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      description: true,
      kind: true,
      dataClass: true,
      fields: true,
      autoSendOnFirstSession: true,
      isActive: true,
      _count: { select: { requests: true } },
      requests: { where: { status: "SUBMITTED" }, select: { id: true } },
    },
  });
  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    kind: t.kind,
    dataClass: t.dataClass,
    fields: t.fields as FormField[],
    autoSendOnFirstSession: t.autoSendOnFirstSession,
    isActive: t.isActive,
    sent: t._count.requests,
    submitted: t.requests.length,
  }));
  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm text-text-muted">
        Fichas, termos e questionários enviados ao paciente por WhatsApp antes da sessão. Respostas <strong>clínicas</strong> ficam cifradas no prontuário; respostas{" "}
        <strong>administrativas</strong> (termos) ficam na ficha.
      </p>
      <TemplateList rows={rows} />
    </div>
  );
}
