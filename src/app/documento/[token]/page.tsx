import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadDocumentByToken } from "@/lib/documents/service";
import { formatDateTimeBR } from "@/lib/time";
import { AcceptForm } from "./accept-form";
import { PrintButton } from "@/components/ui/print-button";

export const metadata: Metadata = { title: "Documento" };

/**
 * Página pública do documento. Sem login: o token é a credencial. Mostra o texto congelado
 * (snapshot); após o aceite, vira o comprovante — com hash — que o paciente pode imprimir.
 */
export default async function PublicDocumentPage({ params }: PageProps<"/documento/[token]">) {
  const { token } = await params;
  if (token.length < 20) notFound();
  const doc = await loadDocumentByToken(token);
  if (!doc) notFound();
  const tz = doc.professional.organization.timezone;
  const first = doc.patient.name.split(" ")[0];

  const closed =
    doc.status === "REVOKED"
      ? { title: "Este documento foi cancelado", text: "Se ainda precisar dele, fale com o profissional." }
      : doc.expired || doc.status === "EXPIRED"
        ? { title: "Este link expirou", text: "Peça um novo link ao profissional." }
        : null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 print:max-w-none print:py-0">
      {closed ? (
        <div className="text-center">
          <h1 className="text-xl font-semibold">{closed.title}</h1>
          <p className="mt-2 text-sm text-text-muted">{closed.text}</p>
        </div>
      ) : (
        <>
          <header className="print:hidden">
            <p className="text-sm text-text-muted">
              {doc.professional.displayName} · {doc.professional.organization.name}
            </p>
            <h1 className="mt-1 text-xl font-semibold">{doc.titleSnapshot}</h1>
            <p className="mt-2 text-xs text-text-muted">
              Olá, {first}. {doc.status === "ACCEPTED" ? "Este é o seu comprovante de aceite." : "Leia com atenção e, se estiver de acordo, aceite ao final."}
            </p>
          </header>
          <h1 className="hidden text-xl font-semibold print:block">{doc.titleSnapshot}</h1>

          <article className="card mt-6 whitespace-pre-wrap text-sm leading-relaxed print:border-0 print:p-0">{doc.bodySnapshot}</article>

          {doc.status === "ACCEPTED" ? (
            <section className="mt-6 rounded-lg border border-border bg-surface-muted/50 p-4 text-xs text-text-muted print:mt-8 print:border-0 print:p-0">
              <p className="font-medium text-text">Aceito eletronicamente</p>
              <p>
                por <strong className="text-text">{doc.acceptName}</strong> em {doc.acceptedAt ? formatDateTimeBR(doc.acceptedAt, tz) : "—"} · versão {doc.templateVersion}
              </p>
              <p className="mt-1 break-all">Hash do documento: {doc.bodyHash}</p>
              <div className="mt-3">
                <PrintButton />
              </div>
            </section>
          ) : (
            <div className="mt-6">
              <AcceptForm token={token} />
            </div>
          )}
        </>
      )}
    </main>
  );
}
