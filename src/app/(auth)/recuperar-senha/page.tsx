import type { Metadata } from "next";
import Link from "next/link";
import { RequestResetForm } from "./request-reset-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RequestResetPage() {
  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold">Recuperar senha</h2>
      <p className="mb-4 text-sm text-text-muted">
        Informe seu e-mail. Se houver uma conta, enviaremos um link para redefinir a senha.
      </p>
      <RequestResetForm />
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-text-muted hover:text-primary hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
