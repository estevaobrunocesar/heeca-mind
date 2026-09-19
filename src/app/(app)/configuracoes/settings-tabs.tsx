"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/configuracoes", label: "Perfil" },
  { href: "/configuracoes/horarios", label: "Horários" },
  { href: "/configuracoes/bloqueios", label: "Bloqueios" },
  { href: "/configuracoes/politicas", label: "Políticas" },
  { href: "/configuracoes/seguranca", label: "Segurança" },
] as const;

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Seções de configuração">
      {TABS.map((t) => {
        const active = t.href === "/configuracoes" ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={
              "-mb-px border-b-2 px-4 py-2 text-sm transition " +
              (active
                ? "border-primary font-medium text-primary"
                : "border-transparent text-text-muted hover:border-border hover:text-text")
            }
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
