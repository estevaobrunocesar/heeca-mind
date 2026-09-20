"use client";

import { useTransition } from "react";
import { openDocumentPortalAction } from "./actions";

/** Gira o token do documento e abre a página pública de aceite. */
export function OpenDocumentButton({ slug, requestId }: { slug: string; requestId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn-primary h-8 shrink-0 px-3 py-0 text-xs" disabled={pending} onClick={() => start(() => openDocumentPortalAction(slug, requestId))}>
      {pending ? "Abrindo…" : "Ler e aceitar"}
    </button>
  );
}
