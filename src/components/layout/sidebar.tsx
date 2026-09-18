"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Início" },
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/configuracoes", label: "Configurações" },
] as const;

export function Sidebar({ userName, publicUrl }: { userName: string; publicUrl: string | null }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">
          H
        </div>
        <span className="font-semibold tracking-tight">Hecca Psico</span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "block rounded-lg px-3 py-2 text-sm transition " +
                (active
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-text-muted hover:bg-surface-muted hover:text-text")
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-4 text-xs text-text-muted">
        <p className="truncate font-medium text-text">{userName}</p>
        {publicUrl && (
          <a
            href={publicUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block truncate text-primary hover:underline"
          >
            Meu link público ↗
          </a>
        )}
      </div>
    </aside>
  );
}
