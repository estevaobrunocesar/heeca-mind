import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ params }: PageProps<"/redefinir-senha/[token]">) {
  const { token } = await params;
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold">Nova senha</h2>
      <ResetPasswordForm token={token} />
    </div>
  );
}
