import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Actor } from "./permissions";
import { assertActive } from "./sessions";

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
  return {
    userId: u.id,
    organizationId: u.organizationId,
    role: u.role,
    professionalId: u.professionalId ?? null,
  };
}

/** Variante que nao redireciona — para rotas que aceitam anonimo. */
export async function getActor(): Promise<Actor | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.organizationId || u.mfaPending) return null;
  if (!(await assertActive(u.sid, u.id))) return null;
  return {
    userId: u.id,
    organizationId: u.organizationId,
    role: u.role,
    professionalId: u.professionalId ?? null,
  };
}
