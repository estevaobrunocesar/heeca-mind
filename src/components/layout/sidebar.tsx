"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ordem do menu do briefing (docs/mind, §39). Pacotes, Documentos e Relatórios
// entram aqui nas etapas 3, 4 e 7 do plano; "Clínico" continua fora deste menu
// (só para quem canOpenClinicalRecord, dentro da ficha do paciente).
export const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/agenda", label: "Agenda" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/servicos", label: "Serviços" },
  { href: "/pacotes", label: "Pacotes" },
  { href: "/financeiro", label: "Financeiro" },
  { href: "/mensagens", label: "Mensagens" },
  { href: "/configuracoes", label: "Configurações" },
] as const;

export function Sidebar({ userName, publicUrl, orgName, hideFinance = false }: { userName: string; publicUrl: string | null; orgName: string | null; hideFinance?: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !(hideFinance && i.href === "/financeiro"));
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-sm font-semibold text-primary">
          H
        </div>
        <span className="font-semibold tracking-tight">Heeca Mind</span>
      </div>
      {orgName && <p className="-mt-3 truncate px-5 pb-3 text-xs text-text-muted">{orgName}</p>}
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
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
