"use client";

import Link from "next/link";
import { useTransition } from "react";
import { togglePackageAction } from "./actions";

export function PackageRowActions({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition();
  const iconBtn = "rounded-md px-2 py-1 text-xs text-text-muted transition hover:bg-surface-muted hover:text-text disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button type="button" className={iconBtn} disabled={pending} onClick={() => start(() => togglePackageAction(id))}>
        {isActive ? "Desativar" : "Ativar"}
      </button>
      <Link href={`/pacotes/${id}`} className={iconBtn}>
        Editar
      </Link>
    </div>
  );
}
