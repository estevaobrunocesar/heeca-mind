"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { DocumentError, installDefaultTemplates, saveDocumentTemplate } from "@/lib/documents/service";
import { invalid, type FormState } from "@/lib/form";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { checkbox } from "@/lib/validation/common";

const schema = z.object({
  kind: z.enum(["CONSENT", "CONTRACT", "POLICY", "AUTHORIZATION", "OTHER"]),
  title: z.string().trim().min(3, "Informe o título").max(120),
  body: z.string().trim().min(20, "O texto precisa ter pelo menos 20 caracteres").max(50_000, "Máximo de 50 mil caracteres"),
  requireBeforeFirstSession: checkbox,
  isActive: checkbox,
});

async function ctx() {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId || !canEditProfessional(actor, professionalId)) throw new Error("Sem permissão");
  return { actor, professionalId };
}

export async function saveDocumentTemplateAction(templateId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  try {
    const r = await saveDocumentTemplate(actor, professionalId, parsed.data, templateId ?? undefined);
    if (r.fieldErrors) return { fieldErrors: r.fieldErrors, values: Object.fromEntries([...formData.entries()].filter((e): e is [string, string] => typeof e[1] === "string")) };
  } catch (e) {
    if (e instanceof DocumentError) return { error: e.message };
    throw e;
  }
  revalidatePath("/configuracoes/documentos");
  return { ok: true };
}

export async function toggleDocumentTemplateAction(templateId: string) {
  const { actor, professionalId } = await ctx();
  const t = await db.documentTemplate.findFirst({ where: { id: templateId, professionalId, organizationId: actor.organizationId }, select: { isActive: true } });
  if (!t) throw new Error("Modelo não encontrado");
  await db.documentTemplate.update({ where: { id: templateId }, data: { isActive: !t.isActive } });
  revalidatePath("/configuracoes/documentos");
}

export async function installDefaultDocumentsAction() {
  const { actor, professionalId } = await ctx();
  await installDefaultTemplates(actor, professionalId);
  revalidatePath("/configuracoes/documentos");
}
