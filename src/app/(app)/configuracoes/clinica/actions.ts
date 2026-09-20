"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { organizationSchema } from "@/lib/validation/organization";

/** Cadastro da clínica (§6). Só OWNER — mesma regra da equipe. */
export async function updateOrganizationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();
  if (!canManageMembers(actor)) return { error: "Só o responsável edita os dados da clínica." };
  const parsed = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return invalid(parsed.error, formData);
  const d = parsed.data;

  if (d.slug) {
    const taken = await db.organization.findFirst({ where: { slug: d.slug, id: { not: actor.organizationId } }, select: { id: true } });
    if (taken) return { fieldErrors: { slug: ["Este endereço já está em uso"] }, values: formValues(formData) };
  }
  const before = await db.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const after = await db.organization.update({ where: { id: actor.organizationId }, data: d });
  // Só metadados de negócio na auditoria — nada do espelho do portal (plano, assinatura).
  const pick = (o: typeof before) => ({
    name: o.name, slug: o.slug, legalName: o.legalName, document: o.document, contactPhone: o.contactPhone, whatsapp: o.whatsapp,
    contactEmail: o.contactEmail, website: o.website, instagram: o.instagram, addressCity: o.addressCity, offersOnline: o.offersOnline, offersInPerson: o.offersInPerson,
  });
  await audit(actor, { organizationId: actor.organizationId, action: "organization.update", entityType: "Organization", entityId: actor.organizationId, before: pick(before), after: pick(after) });
  revalidatePath("/configuracoes/clinica");
  revalidatePath("/", "layout");
  return { ok: true };
}
