import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Criar conta" };

export default function RegisterPage() {
  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold">Criar conta</h2>
      <p className="mb-4 text-sm text-text-muted">
        Leva menos de um minuto. Você configura serviços e horários depois.
      </p>
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
