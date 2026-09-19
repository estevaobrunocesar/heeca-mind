import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "./db";
import type { Actor } from "./permissions";
import { assertActive } from "./sessions";

/** Cookie com o profissional selecionado por dono/recepção de clínica. */
export const ACTIVE_PRO_COOKIE = "hp_pro";

/**
 * Resolve o profissional "ativo" para o ator:
 *  - PROFESSIONAL: sempre o próprio perfil.
 *  - OWNER/RECEPTIONIST: o do cookie, se pertencer à organização; senão o
 *    próprio perfil (dono que também atende); senão o primeiro da clínica.
 */
async function resolveActiveProfessional(u: { organizationId: string; role: Actor["role"]; professionalId: string | null }): Promise<string | null> {
  if (u.role === "PROFESSIONAL") return u.professionalId;

  let selected: string | null = null;
  try {
    selected = (await cookies()).get(ACTIVE_PRO_COOKIE)?.value ?? null;
  } catch {
    selected = null;
  }
  if (selected) {
    const ok = await db.professional.findFirst({ where: { id: selected, organizationId: u.organizationId, isActive: true }, select: { id: true } });
    if (ok) return ok.id;
  }
  if (u.professionalId) return u.professionalId;
  const first = await db.professional.findFirst({ where: { organizationId: u.organizationId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  return first?.id ?? null;
}

async function buildActor(u: { id: string; organizationId: string; role: Actor["role"]; professionalId: string | null }): Promise<Actor> {
  return {
    userId: u.id,
    organizationId: u.organizationId,
    role: u.role,
    professionalId: u.professionalId ?? null,
    activeProfessionalId: await resolveActiveProfessional(u),
  };
}

/**
 * Resolve o ator da requisicao a partir da sessao.
 * Use em Server Components e Server Actions. Redireciona para /login se
 * nao autenticado — nunca retorna null, o que simplifica o codigo chamador.
 */
export async function requireActor(): Promise<Actor> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.organizationId) redirect("/login");
  if (!(await assertActive(u.sid, u.id))) redirect("/login?revoked=1");
  if (u.mfaPending) redirect("/login/mfa"); // defesa em profundidade além do proxy
  return buildActor(u);
}

/** Variante que nao redireciona — para rotas que aceitam anonimo. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.organizationId || u.mfaPending) return null;
  if (!(await assertActive(u.sid, u.id))) return null;
  return buildActor(u);
}
