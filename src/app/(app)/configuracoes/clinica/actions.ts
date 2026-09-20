"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { formValues, invalid, type FormState } from "@/lib/form";
import { IMAGE_EXT, IMAGE_MIME, MAX_PHOTO_BYTES, sniffImage } from "@/lib/image";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { getStorage } from "@/lib/storage";
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

// ──────────────────────────────────────────────────────────────
// Logo da clínica — mesmo desenho da foto de perfil (storage + chave nova a cada upload)
// ──────────────────────────────────────────────────────────────

export async function uploadClinicLogoAction(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const actor = await requireActor();
  if (!canManageMembers(actor)) return { ok: false, error: "Só o responsável edita os dados da clínica." };
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecione uma imagem." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Imagem muito grande (máx. 1,5 MB)." };

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniffImage(buf);
  if (!kind) return { ok: false, error: "Formato não suportado. Use PNG, JPG ou WebP." };

  const orgId = actor.organizationId;
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { logoKey: true, logoUrl: true } });
  const storage = getStorage();
  const { key, url } = await storage.put({ key: `organizations/${orgId}/logo-${Date.now()}.${IMAGE_EXT[kind]}`, body: buf, contentType: IMAGE_MIME[kind] });
  await db.organization.update({ where: { id: orgId }, data: { logoUrl: url, logoKey: key } });
  if (before.logoKey && before.logoKey !== key) await storage.delete(before.logoKey).catch(() => {}); // melhor esforço: a nova já está salva

  await audit(actor, { organizationId: orgId, action: "organization.logo", entityType: "Organization", entityId: orgId, before: { logoUrl: before.logoUrl }, after: { logoUrl: url } });
  revalidatePath("/configuracoes/clinica");
  revalidatePath("/", "layout");
  return { ok: true, url };
}

export async function removeClinicLogoAction(): Promise<void> {
  const actor = await requireActor();
  if (!canManageMembers(actor)) return;
  const orgId = actor.organizationId;
  const before = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { logoKey: true, logoUrl: true } });
  await db.organization.update({ where: { id: orgId }, data: { logoUrl: null, logoKey: null } });
  if (before.logoKey) await getStorage().delete(before.logoKey).catch(() => {});
  await audit(actor, { organizationId: orgId, action: "organization.logo_remove", entityType: "Organization", entityId: orgId, before: { logoUrl: before.logoUrl } });
  revalidatePath("/configuracoes/clinica");
  revalidatePath("/", "layout");
}
