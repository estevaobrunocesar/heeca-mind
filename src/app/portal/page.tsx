import type { Metadata } from "next";

export const metadata: Metadata = { title: "Portal do paciente" };

/** /portal sem slug: o acesso é sempre pela página do seu profissional. */
export default async function PortalIndexPage({ searchParams }: PageProps<"/portal">) {
  const sp = await searchParams;
  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-normal text-primary">Portal do paciente</h1>
      {sp.invalid === "1" ? (
        <p className="mt-3 text-sm text-danger">Este link de acesso não é mais válido (vale 15 minutos e uma única vez).</p>
      ) : null}
      <p className="mt-3 text-sm text-text-muted">Para entrar, use o link da página do seu profissional (o mesmo endereço em que você agenda) e peça um novo acesso por WhatsApp.</p>
    </main>
  );
}
