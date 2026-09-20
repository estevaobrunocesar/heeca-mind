"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { invalid, type FormState } from "@/lib/form";
import { FormError, saveTemplate, setTemplateActive } from "@/lib/forms";
import { STARTER_TEMPLATES } from "@/lib/forms-schema";
import { canEditProfessional } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { checkbox } from "@/lib/validation/common";
import { audit } from "@/lib/audit";

const templateSchema = z.object({
  title: z.string().trim().min(3, "Dê um título").max(120),
  description: z
    .string()
    .trim()
    .max(500, "Máximo de 500 caracteres")
    .transform((v) => (v === "" ? null : v)),
  kind: z.enum(["INTAKE", "CONSENT", "QUESTIONNAIRE", "CUSTOM"]),
  dataClass: z.enum(["CLINICAL", "ADMINISTRATIVE"]),
  autoSendOnFirstSession: checkbox,
  fieldsJson: z.string().min(2, "Adicione campos"),
});

async function ctx() {
  const actor = await requireActor();
  const professionalId = actor.activeProfessionalId;
  if (!professionalId || !canEditProfessional(actor, professionalId)) throw new Error("Sem permissão");
  return { actor, professionalId };
}

export async function saveTemplateAction(templateId: string | null, _prev: FormState, formData: FormData): Promise<FormState> {
  const { actor, professionalId } = await ctx();
  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;
  let fields: unknown;
  try {
    fields = JSON.parse(d.fieldsJson);
  } catch {
    return { fieldErrors: { fields: ["Campos inválidos"] } };
  }
  try {
    const r = await saveTemplate(actor, professionalId, { title: d.title, description: d.description, kind: d.kind, dataClass: d.dataClass, fields, autoSendOnFirstSession: d.autoSendOnFirstSession }, templateId ?? undefined);
    if (r.fieldErrors) return { fieldErrors: r.fieldErrors, values: { title: d.title, description: d.description ?? "", kind: d.kind, dataClass: d.dataClass } };
  } catch (e) {
    if (e instanceof FormError) return { error: e.message };
    throw e;
  }
  revalidatePath("/configuracoes/formularios");
  return { ok: true };
}

export async function toggleTemplateAction(templateId: string, isActive: boolean): Promise<void> {
  const { actor, professionalId } = await ctx();
  await setTemplateActive(actor, professionalId, templateId, isActive);
  revalidatePath("/configuracoes/formularios");
}

/** Cria os modelos iniciais que ainda não existem para este profissional (por título). */
export async function installStartersAction(): Promise<void> {
  const { actor, professionalId } = await ctx();
  const existing = await db.formTemplate.findMany({ where: { professionalId }, select: { title: true } });
  const have = new Set(existing.map((t) => t.title));
  for (const s of STARTER_TEMPLATES) {
    if (have.has(s.title)) continue;
    await db.formTemplate.create({
      data: { organizationId: actor.organizationId, professionalId, title: s.title, description: s.description, kind: s.kind, dataClass: s.dataClass, fields: s.fields, autoSendOnFirstSession: s.key === "intake" },
    });
  }
  await audit(actor, { organizationId: actor.organizationId, action: "form_template.install_starters", entityType: "Professional", entityId: professionalId });
  revalidatePath("/configuracoes/formularios");
}
