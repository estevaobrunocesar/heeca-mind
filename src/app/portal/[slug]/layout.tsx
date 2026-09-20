import Link from "next/link";
import { notFound } from "next/navigation";
import { getPortalActor, professionalBySlug } from "@/lib/portal/service";
import { logoutAction } from "./actions";

/**
 * Casca do portal do paciente. Sem sidebar do app, sem Auth.js: sessão própria (cookie hm_patient).
 * O slug do profissional dá o tenant; a sessão vale para a organização inteira.
 */
export default async function PortalLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const pro = await professionalBySlug(slug);
  if (!pro || !pro.isActive) notFound();
  const actor = await getPortalActor(pro.organizationId);
  const title = pro.organization.type === "CLINIC" ? pro.organization.name : pro.displayName;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-[3px] border-primary bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4">
          <Link href={`/portal/${slug}`} className="font-semibold tracking-tight">
            {title}
          </Link>
          {actor && (
            <nav className="flex items-center gap-4 text-sm">
              <Link href={`/portal/${slug}`} className="text-text-muted hover:text-text">
                Início
              </Link>
              <Link href={`/portal/${slug}/dados`} className="text-text-muted hover:text-text">
                Meus dados
              </Link>
              <form action={logoutAction.bind(null, slug)}>
                <button type="submit" className="text-text-muted hover:text-text">
                  Sair
                </button>
              </form>
            </nav>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
      <footer className="border-t border-border px-4 py-4 text-center text-xs text-text-muted">Portal do paciente · Heeca Mind. Aqui ficam só dados administrativos: horários, pagamentos, documentos e cadastro.</footer>
    </div>
  );
}
