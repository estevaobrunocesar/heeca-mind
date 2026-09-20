import type { Metadata } from "next";
import Link from "next/link";
import { platformEnabled, portalProductUrl, portalSsoUrl } from "@/lib/heeca/service";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const justReset = sp.reset === "1";
  const revoked = sp.revoked === "1";
  const ssoError = typeof sp.sso_error === "string" ? sp.sso_error : null;
  const platform = platformEnabled();
  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold">Entrar</h2>
      {ssoError && (
        <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          {ssoError}
        </div>
      )}
      {platform && (
        <>
          <a href={portalSsoUrl()} className="btn-primary w-full">
            Entrar com a conta Heeca
          </a>
          <div className="my-4 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            ou com e-mail e senha
            <span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <LoginForm justReset={justReset} revoked={revoked} />
      <p className="mt-6 text-center text-sm text-text-muted">
        Ainda não tem conta?{" "}
        {platform ? (
          <a href={portalProductUrl()} className="font-medium text-primary hover:underline">
            Conheça o Heeca Mind
          </a>
        ) : (
          <Link href="/cadastro" className="font-medium text-primary hover:underline">
            Criar conta
          </Link>
        )}
      </p>
    </div>
  );
}
