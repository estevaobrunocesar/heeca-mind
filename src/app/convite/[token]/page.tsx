import type { Metadata } from "next";
import { ROLE_LABEL } from "@/lib/validation/team";
import { AcceptForm } from "./accept-form";
import { findInvitation } from "./actions";

export const metadata: Metadata = { title: "Convite" };

export default async function InvitePage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const inv = await findInvitation(token);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-xl font-semibold text-primary">H</div>
          <h1 className="text-2xl font-semibold tracking-tight">Hecca Psico</h1>
        </div>
        <div className="card">
          {!inv ? (
            <>
              <h2 className="text-lg font-semibold">Convite inválido ou expirado</h2>
              <p className="mt-2 text-sm text-text-muted">Peça ao responsável pela clínica para enviar um novo convite.</p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold">Você foi convidado(a)</h2>
              <p className="mt-1 text-sm text-text-muted">
                Para entrar em <span className="font-medium text-text">{inv.organization.name}</span> como {ROLE_LABEL[inv.role].toLowerCase()}, com o e-mail{" "}
                <span className="font-medium text-text">{inv.email}</span>.
              </p>
              <div className="mt-5">
                <AcceptForm token={token} isProfessional={inv.role === "PROFESSIONAL"} />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
