import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/empty-state";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { PhotoUploader } from "./photo-uploader";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Perfil" };

export default async function ProfileSettingsPage() {
  const actor = await requireActor();
  if (!actor.professionalId) {
    return <EmptyState title="Nenhum perfil profissional vinculado" description="Sua conta não possui um perfil de psicólogo." />;
  }

  const profile = await db.professional.findUniqueOrThrow({
    where: { id: actor.professionalId },
    select: {
      displayName: true,
      fullName: true,
      crp: true,
      showCrp: true,
      photoUrl: true,
      bio: true,
      approaches: true,
      specialties: true,
      phone: true,
      whatsapp: true,
      email: true,
      instagram: true,
      website: true,
      addressLine: true,
      addressCity: true,
      addressState: true,
      addressZip: true,
      slug: true,
      showPrices: true,
      onlinePlatform: true,
      onlineFixedLink: true,
    },
  });

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/^https?:\/\//, "");
  const { photoUrl, ...formProfile } = profile;
  return (
    <div className="max-w-3xl space-y-6">
      <PhotoUploader photoUrl={photoUrl} displayName={profile.displayName} />
      <ProfileForm profile={formProfile} publicBaseUrl={base} />
    </div>
  );
}
