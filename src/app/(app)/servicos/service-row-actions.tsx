"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { deleteServiceAction, moveServiceAction, toggleServiceAction } from "./actions";

export function ServiceRowActions({
  id,
  isActive,
  isFirst,
  isLast,
}: {
  id: string;
  isActive: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (!confirm("Excluir este serviço? Esta ação não pode ser desfeita.")) return;
    start(async () => {
      const res = await deleteServiceAction(id);
      setError(res.error ?? null);
    });
  }

  const iconBtn =
    "rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-40";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={iconBtn}
          disabled={pending || isFirst}
          onClick={() => start(() => moveServiceAction(id, "up"))}
          aria-label="Mover para cima"
          title="Mover para cima"
        >
          ↑
        </button>
        <button
          type="button"
          className={iconBtn}
          disabled={pending || isLast}
          onClick={() => start(() => moveServiceAction(id, "down"))}
          aria-label="Mover para baixo"
          title="Mover para baixo"
        >
          ↓
        </button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button
          type="button"
          className={iconBtn}
          disabled={pending}
          onClick={() => start(() => toggleServiceAction(id))}
        >
          {isActive ? "Desativar" : "Ativar"}
        </button>
        <Link href={`/servicos/${id}`} className={iconBtn}>
          Editar
        </Link>
        <button
          type="button"
          className={`${iconBtn} hover:text-danger`}
          disabled={pending}
          onClick={handleDelete}
        >
          Excluir
        </button>
      </div>
      {error && <p className="max-w-xs text-right text-xs text-danger">{error}</p>}
    </div>
  );
}
