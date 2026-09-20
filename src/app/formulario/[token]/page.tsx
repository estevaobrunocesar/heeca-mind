import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadRequestByToken } from "@/lib/forms";
import { PublicFormFields } from "./form-fields";

export const metadata: Metadata = { title: "Formulário" };

/**
 * Página pública de resposta. Sem login: o token é a credencial. Mostra o
 * snapshot dos campos; após enviar, o link deixa de funcionar.
 */
export default async function PublicFormPage({ params }: PageProps<"/formulario/[token]">) {
  const { token } = await params;
  if (token.length < 20) notFound();
  const req = await loadRequestByToken(token);
  if (!req) notFound();

  const first = req.patient.name.split(" ")[0];
  const closed =
    req.status === "SUBMITTED"
      ? { title: "Respostas enviadas", text: `Obrigado, ${first}! ${req.professional.displayName} já tem acesso às suas respostas.` }
      : req.status === "CANCELLED"
        ? { title: "Este formulário foi cancelado", text: "Se ainda precisar respondê-lo, fale com o profissional." }
        : req.expired || req.status === "EXPIRED"
          ? { title: "Este link expirou", text: "Peça um novo link ao profissional." }
          : null;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-8">
      {closed ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-2xl text-primary">✓</div>
          <h1 className="text-xl font-semibold">{closed.title}</h1>
          <p className="mt-2 text-sm text-text-muted">{closed.text}</p>
        </div>
      ) : (
        <>
          <header>
            <p className="text-sm text-text-muted">{req.professional.displayName} pede que você responda:</p>
            <h1 className="mt-1 text-xl font-semibold">{req.titleSnapshot}</h1>
            {req.descriptionSnapshot && <p className="mt-2 text-sm text-text-muted">{req.descriptionSnapshot}</p>}
            <p className="mt-2 text-xs text-text-muted">
              Olá, {first}. {req.dataClass === "CLINICAL" ? "Suas respostas são confidenciais: ficam cifradas e só o profissional que te atende as vê." : "Suas respostas ficam registradas na sua ficha."}
            </p>
          </header>
          <div className="mt-6">
            <PublicFormFields token={token} fields={req.fields} />
          </div>
        </>
      )}
    </main>
  );
}
