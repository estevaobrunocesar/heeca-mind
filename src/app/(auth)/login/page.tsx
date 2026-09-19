import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const justReset = sp.reset === "1";
  const revoked = sp.revoked === "1";
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold">Entrar</h2>
      <LoginForm justReset={justReset} revoked={revoked} />
      <p className="mt-6 text-center text-sm text-text-muted">
        Ainda não tem conta?{" "}
        <Link href="/cadastro" className="font-medium text-primary hover:underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
