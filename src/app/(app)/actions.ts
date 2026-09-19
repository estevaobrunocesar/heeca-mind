"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ACTIVE_PRO_COOKIE, requireActor } from "@/lib/session";

/** Dono/recepção escolhe qual profissional da clínica está vendo. */
export async function setActiveProfessionalAction(professionalId: string) {
  const actor = await requireActor();
  if (actor.role === "PROFESSIONAL") return; // psicólogo só vê a si mesmo
  const ok = await db.professional.findFirst({ where: { id: professionalId, organizationId: actor.organizationId, isActive: true }, select: { id: true } });
  if (!ok) return;
  (await cookies()).set(ACTIVE_PRO_COOKIE, professionalId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/", "layout");
}
