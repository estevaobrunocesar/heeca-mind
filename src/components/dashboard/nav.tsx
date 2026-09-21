"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Ordem do menu do briefing (docs/mind, §39). Os 4 primeiros vão para a barra inferior do celular; o resto fica em
// "Mais". "Clínico" continua fora deste menu (só para quem canOpenClinicalRecord, dentro da ficha do paciente).
export const NAV: { href: string; label: string; icon: (p: IconProps) => React.JSX.Element }[] = [
  { href: "/dashboard", label: "Início", icon: HomeIcon },
  { href: "/agenda", label: "Agenda", icon: CalendarIcon },
  { href: "/pacientes", label: "Pacientes", icon: UsersIcon },
  { href: "/mensagens", label: "Mensagens", icon: ChatIcon },
  { href: "/servicos", label: "Serviços", icon: ServicesIcon },
  { href: "/pacotes", label: "Pacotes", icon: PackageIcon },
  { href: "/financeiro", label: "Financeiro", icon: MoneyIcon },
  { href: "/relatorios", label: "Relatórios", icon: ChartIcon },
  { href: "/configuracoes", label: "Configurações", icon: SettingsIcon },
];

export function DashboardNav({ variant, hideFinance = false }: { variant: "sidebar" | "bottom"; hideFinance?: boolean }) {
  const visible = NAV.filter((i) => !(hideFinance && i.href === "/financeiro"));
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  if (variant === "sidebar") {
    return (
      <nav className="flex flex-col gap-0.5">
        {visible.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-medium transition ${
              isActive(href) ? "bg-brand-600 text-white" : "text-ink-2 hover:bg-zinc-100 hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    );
  }

  // Mobile: barra inferior com os 4 principais + "Mais" (folha com o restante)
  return <BottomNav visible={visible} isActive={isActive} />;
}

function BottomNav({ visible, isActive }: { visible: typeof NAV; isActive: (href: string) => boolean }) {
  // A folha "Mais" fica aberta só na rota em que foi aberta: navegar fecha sem precisar de efeito.
  const [abertoEm, setAbertoEm] = useState<string | null>(null);
  const pathname = usePathname();
  const aberto = abertoEm === pathname;
  const setAberto = (v: boolean) => setAbertoEm(v ? pathname : null);
  const principais = visible.slice(0, 4);
  const resto = visible.slice(4);
  const restoAtivo = resto.some((i) => isActive(i.href));
  const item = (href: string, label: string, Icon: (p: IconProps) => React.JSX.Element, ativo: boolean) => (
    <Link key={href} href={href} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${ativo ? "text-brand-600" : "text-mut"}`}>
      <Icon className="h-5 w-5" />
      {label}
    </Link>
  );
  return (
    <>
      {aberto && (
        <div className="fixed inset-0 z-20 bg-ink/30 md:hidden" onClick={() => setAberto(false)}>
          <div className="absolute inset-x-0 bottom-[60px] rounded-t-2xl border-t border-line bg-white p-3 pb-2" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
            <div className="grid grid-cols-4 gap-1">
              {resto.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} className={`flex flex-col items-center gap-1 rounded-[10px] px-1 py-2.5 text-[10.5px] font-medium ${isActive(href) ? "bg-brand-50 text-brand-700" : "text-ink-2"}`}>
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {principais.map(({ href, label, icon: Icon }) => item(href, label, Icon, isActive(href)))}
        {resto.length > 0 && (
          <button type="button" onClick={() => setAberto(!aberto)} className={`flex flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium ${aberto || restoAtivo ? "text-brand-600" : "text-mut"}`}>
            <MoreIcon className="h-5 w-5" />
            Mais
          </button>
        )}
      </nav>
    </>
  );
}

type IconProps = { className?: string };
const base = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24" };

function MoreIcon(p: IconProps) {
  return <svg {...base} {...p}><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>;
}
function HomeIcon(p: IconProps) {
  return <svg {...base} {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></svg>;
}
function CalendarIcon(p: IconProps) {
  return <svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}
function UsersIcon(p: IconProps) {
  return <svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4.5-6.2" /></svg>;
}
function ChatIcon(p: IconProps) {
  return <svg {...base} {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" /></svg>;
}
function ServicesIcon(p: IconProps) {
  // Sessão: lista de serviços
  return <svg {...base} {...p}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" /></svg>;
}
function PackageIcon(p: IconProps) {
  return <svg {...base} {...p}><path d="M21 8l-9-4-9 4 9 4 9-4z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></svg>;
}
function ChartIcon(p: IconProps) {
  return <svg {...base} {...p}><path d="M3 20h18" /><rect x="5" y="11" width="3.5" height="7" rx="0.5" /><rect x="10.25" y="6" width="3.5" height="12" rx="0.5" /><rect x="15.5" y="9" width="3.5" height="9" rx="0.5" /></svg>;
}
function MoneyIcon(p: IconProps) {
  return <svg {...base} {...p}><rect x="2" y="6" width="20" height="13" rx="3" /><circle cx="12" cy="12.5" r="3" /></svg>;
}
function SettingsIcon(p: IconProps) {
  return <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}
