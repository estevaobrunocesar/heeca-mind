import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function MfaPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!session.user.mfaPending) redirect("/dashboard");

  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold">Verificação em duas etapas</h2>
      <p className="mb-4 text-sm text-text-muted">
        Abra o app autenticador no celular e digite o código de 6 dígitos. Se perdeu o acesso, use um código de recuperação.
      </p>
      <MfaForm />
      <form
        className="mt-6 text-center"
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="text-xs text-text-muted hover:text-primary hover:underline">
          Entrar com outra conta
        </button>
      </form>
    </div>
  );
}
