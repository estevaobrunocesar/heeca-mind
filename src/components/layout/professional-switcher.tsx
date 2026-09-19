"use client";

import { useTransition } from "react";
import { setActiveProfessionalAction } from "@/app/(app)/actions";

export function ProfessionalSwitcher({
  options,
  activeId,
}: {
  options: Array<{ id: string; label: string }>;
  activeId: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-text-muted">Agenda de</span>
      <select
        className="rounded-md border border-border bg-surface px-2 py-1 text-sm font-medium disabled:opacity-60"
        value={activeId ?? ""}
        disabled={pending}
        onChange={(e) => start(() => setActiveProfessionalAction(e.target.value))}
        aria-label="Profissional selecionado"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
