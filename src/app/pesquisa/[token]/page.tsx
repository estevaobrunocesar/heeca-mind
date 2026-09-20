import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSurveyByToken } from "@/lib/reports/service";
import { SurveyForm } from "./survey-form";

export const metadata: Metadata = { title: "Sua experiência" };

/** Pesquisa administrativa de experiência (§29). Sem login; uso único; não pede nada clínico. */
export default async function SurveyPage({ params }: PageProps<"/pesquisa/[token]">) {
  const { token } = await params;
  if (token.length < 20) notFound();
  const s = await loadSurveyByToken(token);
  if (!s) notFound();
  const who = s.professional.organization.type === "CLINIC" ? s.professional.organization.name : s.professional.displayName;
  const first = s.patient.name.split(" ")[0];
  const closed = s.answeredAt ? { title: "Obrigado pela resposta!", text: "Sua opinião ajuda a melhorar o atendimento." } : s.expired ? { title: "Esta pesquisa expirou", text: "Obrigado mesmo assim." } : null;
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
            <p className="text-sm text-text-muted">{who}</p>
            <h1 className="mt-1 text-xl font-semibold">Olá, {first}. Como foi sua experiência com nosso atendimento?</h1>
            <p className="mt-2 text-xs text-text-muted">Sobre o serviço: agendamento, comunicação, pontualidade, ambiente. Não é uma avaliação do seu acompanhamento — isso fica entre você e o profissional.</p>
          </header>
          <div className="mt-6">
            <SurveyForm token={token} />
          </div>
        </>
      )}
    </main>
  );
}
