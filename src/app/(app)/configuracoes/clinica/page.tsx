import type { Metadata } from "next";
import { db } from "@/lib/db";
import { canManageMembers } from "@/lib/permissions";
import { requireActor } from "@/lib/session";
import { LogoUploader } from "./logo-uploader";
import { OrganizationForm } from "./organization-form";
import { GoalForm } from "./goal-form";

export const metadata: Metadata = { title: "Clínica" };

export default async function ClinicSettingsPage() {
  const actor = await requireActor();
  if (!canManageMembers(actor)) {
    return <p className="text-sm text-text-muted">Só o responsável pela conta edita os dados da clínica.</p>;
  }
  const org = await db.organization.findUniqueOrThrow({
    where: { id: actor.organizationId },
    select: {
      name: true, slug: true, type: true, logoUrl: true, legalName: true, document: true, contactPhone: true, whatsapp: true, contactEmail: true,
      website: true, instagram: true, addressLine: true, addressCity: true, addressState: true, addressZip: true, offersOnline: true, offersInPerson: true,
      metaMensalCents: true,
    },
  });
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { logoUrl, metaMensalCents, ...values } = org;
  return (
    <div className="space-y-6">
      <LogoUploader logoUrl={logoUrl} orgName={org.name} />
      <OrganizationForm org={values} publicBaseUrl={base} />
      <GoalForm metaMensal={metaMensalCents != null ? (metaMensalCents / 100).toFixed(2).replace(".", ",") : ""} />
    </div>
  );
}
