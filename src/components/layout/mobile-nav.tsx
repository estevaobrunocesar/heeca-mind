"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./sidebar";

/** Barra de navegação horizontal para telas < md; a sidebar cuida do resto. */
export function MobileNav({ hideFinance = false }: { hideFinance?: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !(hideFinance && i.href === "/financeiro"));
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-border bg-surface px-2 py-1 md:hidden" aria-label="Navegação">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              "shrink-0 rounded-md px-3 py-1.5 text-sm " +
              (active ? "bg-primary-soft font-medium text-primary" : "text-text-muted")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
