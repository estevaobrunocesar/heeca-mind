import type { Metadata } from "next";
import { db } from "@/lib/db";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { OrganizationForm } from "./organization-form";

export const metadata: Metadata = { title: "Clínica" };

export default async function ClinicSettingsPage() {
  const actor = await requireActor();
  if (!canManageMembers(actor)) {
    return <p className="text-sm text-text-muted">Só o responsável pela conta edita os dados da clínica.</p>;
  }
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: {
      name: true, slug: true, type: true, legalName: true, document: true, contactPhone: true, whatsapp: true, contactEmail: true,
      website: true, instagram: true, addressLine: true, addressCity: true, addressState: true, addressZip: true, offersOnline: true, offersInPerson: true,
    },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return <OrganizationForm org={org} publicBaseUrl={base} />;
}
