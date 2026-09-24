/**
 * Marca Heeca — componente compartilhado entre o portal e os produtos.
 * GERADO por brand/build.mjs a partir de brand/geometry.mjs — não edite; rode `pnpm build` em brand/.
 *
 * Conceito "Tipografia Exclusiva": o logotipo HEECA é desenho (curvas), nunca texto — o arco vermelho
 * é a barra do H e as barras superiores dos E são vermelhas. O símbolo é o H com o arco.
 * Cores: letras em `currentColor` por padrão (seguem o tema), `onDark` força branco; o arco é sempre
 * o vermelho institucional. Nome do produto e slogan usam Inter (var(--font-ui), com fallback).
 *
 *   <Logo product="ticket" size={26} />          logotipo + TICKET          (cabeçalho, sidebar)
 *   <Logo product="ticket" variant="vertical" /> tudo centralizado          (login) — slogan opcional
 *   <Logo product="ticket" variant="symbol" />   só o símbolo (H + arco)    (avatar, favicon inline)
 *   <LogoIntro product="ticket" />               abertura animada (o arco varre e conecta)
 */
import type { CSSProperties } from "react";

/** Pictogramas (miolo SVG 24 × 24, traço herdado). Fonte: Lucide (ISC) + desenhos próprios em brand/pictograms.mjs. */
export const HEECA_PICTOGRAMS: Partial<Record<string, string>> = {
  "ticket": "<path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\" />\n  <path d=\"M13 5v2\" />\n  <path d=\"M13 17v2\" />\n  <path d=\"M13 11v2\" />",
  "invoice": "<path d=\"M12 17V7\" />\n  <path d=\"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8\" />\n  <path d=\"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z\" />",
  "beauty": "<path d=\"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z\" />\n  <path d=\"M20 2v4\" />\n  <path d=\"M22 4h-4\" />\n  <circle cx=\"4\" cy=\"20\" r=\"2\" />",
  "wellness": "<path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\" />\n  <path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\" />",
  "bronze": "<circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 2v2\" />\n  <path d=\"M12 20v2\" />\n  <path d=\"m4.93 4.93 1.41 1.41\" />\n  <path d=\"m17.66 17.66 1.41 1.41\" />\n  <path d=\"M2 12h2\" />\n  <path d=\"M20 12h2\" />\n  <path d=\"m6.34 17.66-1.41 1.41\" />\n  <path d=\"m19.07 4.93-1.41 1.41\" />",
  "ink": "<path d=\"M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z\" />\n  <path d=\"m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18\" />\n  <path d=\"m2.3 2.3 7.286 7.286\" />\n  <circle cx=\"11\" cy=\"11\" r=\"2\" />",
  "piercing": "<path d=\"M10.5 3 8 9l4 13 4-13-2.5-6\" />\n  <path d=\"M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z\" />\n  <path d=\"M2 9h20\" />",
  "move": "<path d=\"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2\" />",
  "mind": "<path d=\"M12 18V5\" />\n  <path d=\"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4\" />\n  <path d=\"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5\" />\n  <path d=\"M17.997 5.125a4 4 0 0 1 2.526 5.77\" />\n  <path d=\"M18 18a4 4 0 0 0 2-7.464\" />\n  <path d=\"M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517\" />\n  <path d=\"M6 18a4 4 0 0 1-2-7.464\" />\n  <path d=\"M6.003 5.125a4 4 0 0 0-2.526 5.77\" />",
  "nutri": "<path d=\"M12 6.528V3a1 1 0 0 1 1-1h0\" />\n  <path d=\"M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21\" />",
  "dental": "<path d=\"M12 5.5c-1.6-1.2-3.2-1.9-4.7-1.9C4.5 3.6 3 5.7 3 8.3c0 2.2 1 3.7 1.6 5.6.7 2.3 1 6.6 2.8 6.6 1.9 0 2-4.6 4.6-4.6s2.7 4.6 4.6 4.6c1.8 0 2.1-4.3 2.8-6.6C20 12 21 10.5 21 8.3c0-2.6-1.5-4.7-4.3-4.7-1.5 0-3.1.7-4.7 1.9z\"/>",
  "med": "<path d=\"M11 2v2\" />\n  <path d=\"M5 2v2\" />\n  <path d=\"M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\" />\n  <path d=\"M8 15a6 6 0 0 0 12 0v-3\" />\n  <circle cx=\"20\" cy=\"10\" r=\"2\" />",
  "fono": "<path d=\"M2 10v3\" />\n  <path d=\"M6 6v11\" />\n  <path d=\"M10 3v18\" />\n  <path d=\"M14 8v7\" />\n  <path d=\"M18 5v13\" />\n  <path d=\"M22 10v3\" />",
  "pet": "<circle cx=\"11\" cy=\"4\" r=\"2\" />\n  <circle cx=\"18\" cy=\"8\" r=\"2\" />\n  <circle cx=\"20\" cy=\"16\" r=\"2\" />\n  <path d=\"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z\" />",
  "food": "<path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" />\n  <path d=\"M7 2v20\" />\n  <path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />",
  "service": "<path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />",
  "build": "<path d=\"M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5\" />\n  <path d=\"M14 6a6 6 0 0 1 6 6v3\" />\n  <path d=\"M4 15v-3a6 6 0 0 1 6-6\" />\n  <rect x=\"2\" y=\"15\" width=\"20\" height=\"4\" rx=\"1\" />",
  "atelier": "<path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" />",
  "event": "<path d=\"M5.8 11.3 2 22l10.7-3.79\" />\n  <path d=\"M4 3h.01\" />\n  <path d=\"M22 8h.01\" />\n  <path d=\"M15 2h.01\" />\n  <path d=\"M22 20h.01\" />\n  <path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\" />\n  <path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\" />\n  <path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\" />\n  <path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\" />",
  "studio": "<path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" />\n  <circle cx=\"12\" cy=\"13\" r=\"3\" />",
  "class": "<path d=\"M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z\" />\n  <path d=\"M22 10v6\" />\n  <path d=\"M6 12.5V16a6 3 0 0 0 12 0v-3.5\" />",
  "store": "<path d=\"M16 10a4 4 0 0 1-8 0\" />\n  <path d=\"M3.103 6.034h17.794\" />\n  <path d=\"M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z\" />",
  "kids": "<path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" />\n  <path d=\"M15 12h.01\" />\n  <path d=\"M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" />\n  <path d=\"M9 12h.01\" />",
};

/** Famílias (a cor é da família; os produtos herdam). Fonte: brand/products.mjs. */
export const HEECA_FAMILIES = {
  platform: { label: "Plataforma", color: "#E31B23", onDark: "#E31B23" },
  ops: { label: "Atendimento e operações", color: "#0a6ee6", onDark: "#0a6ee6" },
  finance: { label: "Financeiro", color: "#0f8a5f", onDark: "#0f8a5f" },
  beauty: { label: "Beleza e estética", color: "#c8306f", onDark: "#c8306f" },
  health: { label: "Saúde e bem-estar", color: "#f06511", onDark: "#f06511" },
  pet: { label: "Pet", color: "#4d7c0f", onDark: "#4d7c0f" },
  food: { label: "Alimentação", color: "#b45309", onDark: "#b45309" },
  service: { label: "Serviços autônomos", color: "#0e7490", onDark: "#0e7490" },
  home: { label: "Construção e projetos", color: "#57534e", onDark: "#b5aea8" },
  fashion: { label: "Moda e costura", color: "#86198f", onDark: "#d466db" },
  events: { label: "Eventos e criativos", color: "#881337", onDark: "#f25c85" },
  education: { label: "Educação", color: "#1e3a8a", onDark: "#7c9cf5" },
  commerce: { label: "Comércio", color: "#6d28d9", onDark: "#a883f7" },
  childcare: { label: "Creches e educação infantil", color: "#92710f", onDark: "#92710f" },
} as const;
export type HeecaFamily = keyof typeof HEECA_FAMILIES;

/** Produtos (fonte: brand/products.csv). sigla é única na plataforma; color = cor da família. */
export const HEECA_PRODUCTS = {
  "heeca": { name: "", color: "#E31B23", fullName: "Heeca", colorOnDark: "#E31B23", family: "platform", engine: "Core", sigla: "" },
  "ticket": { name: "Ticket", color: "#0a6ee6", fullName: "Heeca Ticket", colorOnDark: "#0a6ee6", family: "ops", engine: "Ticket", sigla: "Ti" },
  "invoice": { name: "Invoice", color: "#0f8a5f", fullName: "Heeca Invoice", colorOnDark: "#0f8a5f", family: "finance", engine: "Invoice", sigla: "In" },
  "beauty": { name: "Beauty", color: "#c8306f", fullName: "Heeca Beauty", colorOnDark: "#c8306f", family: "beauty", engine: "Schedule", sigla: "Be" },
  "wellness": { name: "Wellness", color: "#c8306f", fullName: "Heeca Wellness", colorOnDark: "#c8306f", family: "beauty", engine: "Schedule", sigla: "We" },
  "bronze": { name: "Bronze", color: "#c8306f", fullName: "Heeca Bronze", colorOnDark: "#c8306f", family: "beauty", engine: "Schedule", sigla: "Br" },
  "ink": { name: "Ink", color: "#c8306f", fullName: "Heeca Ink", colorOnDark: "#c8306f", family: "beauty", engine: "Schedule", sigla: "Ink" },
  "piercing": { name: "Piercing", color: "#c8306f", fullName: "Heeca Piercing", colorOnDark: "#c8306f", family: "beauty", engine: "Schedule", sigla: "Pi" },
  "move": { name: "Move", color: "#f06511", fullName: "Heeca Move", colorOnDark: "#f06511", family: "health", engine: "Schedule", sigla: "Mo" },
  "mind": { name: "Mind", color: "#f06511", fullName: "Heeca Mind", colorOnDark: "#f06511", family: "health", engine: "Health", sigla: "Mi" },
  "nutri": { name: "Nutri", color: "#f06511", fullName: "Heeca Nutri", colorOnDark: "#f06511", family: "health", engine: "Health", sigla: "Nu" },
  "dental": { name: "Dental", color: "#f06511", fullName: "Heeca Dental", colorOnDark: "#f06511", family: "health", engine: "Health", sigla: "De" },
  "med": { name: "Med", color: "#f06511", fullName: "Heeca Med", colorOnDark: "#f06511", family: "health", engine: "Health", sigla: "Me" },
  "fono": { name: "Fono", color: "#f06511", fullName: "Heeca Fono", colorOnDark: "#f06511", family: "health", engine: "Health", sigla: "Fn" },
  "pet": { name: "Pet", color: "#4d7c0f", fullName: "Heeca Pet", colorOnDark: "#4d7c0f", family: "pet", engine: "Schedule", sigla: "Pe" },
  "food": { name: "Food", color: "#b45309", fullName: "Heeca Food", colorOnDark: "#b45309", family: "food", engine: "Commerce", sigla: "Fo" },
  "service": { name: "Service", color: "#0e7490", fullName: "Heeca Service", colorOnDark: "#0e7490", family: "service", engine: "Service", sigla: "Se" },
  "build": { name: "Build", color: "#57534e", fullName: "Heeca Build", colorOnDark: "#b5aea8", family: "home", engine: "Project", sigla: "Bu" },
  "atelier": { name: "Atelier", color: "#86198f", fullName: "Heeca Atelier", colorOnDark: "#d466db", family: "fashion", engine: "Project", sigla: "At" },
  "event": { name: "Event", color: "#881337", fullName: "Heeca Event", colorOnDark: "#f25c85", family: "events", engine: "Project", sigla: "Ev" },
  "studio": { name: "Studio", color: "#881337", fullName: "Heeca Studio", colorOnDark: "#f25c85", family: "events", engine: "Studio", sigla: "Su" },
  "class": { name: "Class", color: "#1e3a8a", fullName: "Heeca Class", colorOnDark: "#7c9cf5", family: "education", engine: "Schedule", sigla: "Cl" },
  "store": { name: "Store", color: "#6d28d9", fullName: "Heeca Store", colorOnDark: "#a883f7", family: "commerce", engine: "Commerce", sigla: "St" },
  "kids": { name: "Kids", color: "#92710f", fullName: "Heeca Kids", colorOnDark: "#92710f", family: "childcare", engine: "Schedule", sigla: "Ki" },
} as const;
export type HeecaProduct = keyof typeof HEECA_PRODUCTS;
export const SLOGAN = "Sistemas que fazem o seu negócio evoluir.";

/** Tokens do handoff (color.brand.*). */
export const HEECA_COLORS = { red: "#E31B23", redHover: "#B90F19", black: "#15171A", graphite: "#30343A", textSecondary: "#667085", border: "#E5E7EB", warm: "#F7F4EF" } as const;

const RED = HEECA_COLORS.red;
const SYMBOL = { w: 148, h: 100 };
const WORD = { w: 573, h: 100 };
const G = {
  stems: [{"x":17,"w":28},{"x":104,"w":28}],
  stemY: 0,
  arc: "M0 81.5A90.6 90.6 0 0 1 148 81.5A148.2 148.2 0 0 0 0 81.5Z",
  symbolStems: [{ x: 17, w: 28 }, { x: 104, w: 28 }],
  eBar: {"x":0,"y":0,"w":85,"h":20},
  eBody: "M0 40H74V60H26V80H85V100H0Z",
  eX: [163,266],
  c: {"x":370,"d":"M87 0H21A21 21 0 0 0 0 21V79A21 21 0 0 0 21 100H84V80H36A11 11 0 0 1 25 69V31A11 11 0 0 1 36 20H87Z"},
  a: {"x":462,"d":"M0 100L43.5 0H67.5L111 100H87L55.5 27.9L24 100Z"},
};

/** `size` é a altura de referência do sinal; as maiúsculas do logotipo têm 62 % dela. */
const CAP_RATIO = 0.62;

/** Fonte de apoio (nome do produto e slogan): Inter. O logotipo não usa fonte. */
const UI_FONT = "var(--font-ui, var(--font-brand, Inter)), Inter, system-ui, sans-serif";

type SymbolProps = { h?: string; accent?: string; size?: number; title?: string; className?: string; style?: CSSProperties; cls?: string };

/** Símbolo: o H com o arco. `size` = altura em px (caixa 148 × 100). */
export function HeecaSymbol({ h = "currentColor", accent = RED, size = 32, title, className, style, cls }: SymbolProps) {
  return (
    <svg viewBox={`0 0 ${SYMBOL.w} ${SYMBOL.h}`} height={size} width={(size * SYMBOL.w) / SYMBOL.h} className={className} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      {G.symbolStems.map((s, i) => <rect key={i} className={cls ? `${cls}0` : undefined} x={s.x} y={0} width={s.w} height={100} fill={h} />)}
      <path className={cls ? `${cls}arc` : undefined} d={G.arc} fill={accent} />
    </svg>
  );
}

/** Logotipo HEECA em curvas. `height` = altura das maiúsculas em px. */
export function HeecaWordmark({ ink = "currentColor", accent = RED, height = 16, className, style, cls }: { ink?: string; accent?: string; height?: number; className?: string; style?: CSSProperties; cls?: string }) {
  const k = (n: string) => (cls ? `${cls}${n}` : undefined);
  return (
    <svg viewBox={`0 0 ${WORD.w} ${WORD.h}`} height={height} width={(height * WORD.w) / WORD.h} className={className} style={{ display: "block", ...style }} aria-hidden="true">
      {G.stems.map((s, i) => <rect key={i} className={k("0")} x={s.x} y={0} width={s.w} height={100} fill={ink} />)}
      <path className={k("arc")} d={G.arc} fill={accent} />
      {/* o transform fica no <g> externo: a animação termina em transform:none e sobrescreveria o atributo */}
      {G.eX.map((x, i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <g className={k(String(i + 1))}>
            <rect x={G.eBar.x} y={G.eBar.y} width={G.eBar.w} height={G.eBar.h} fill={accent} />
            <path d={G.eBody} fill={ink} />
          </g>
        </g>
      ))}
      <g transform={`translate(${G.c.x} 0)`}><path className={k("3")} d={G.c.d} fill={ink} /></g>
      <g transform={`translate(${G.a.x} 0)`}><path className={k("4")} d={G.a.d} fill={ink} /></g>
    </svg>
  );
}

export type LogoProps = {
  product?: HeecaProduct;
  variant?: "horizontal" | "vertical" | "symbol";
  /** Superfície sempre escura: letras em branco. */
  onDark?: boolean;
  /** Mostra o slogan sob o logotipo (só em tamanhos grandes: login, materiais). */
  slogan?: boolean;
  /** Altura de referência em px: no variant "symbol" é a altura do símbolo; nos demais, as
   * maiúsculas do logotipo têm 62 % dela (mesma escala visual do kit anterior). */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

export function Logo({ product = "heeca", variant = "horizontal", onDark = false, slogan = false, size = 32, className, style }: LogoProps) {
  const p = HEECA_PRODUCTS[product];
  const ink = onDark ? "#FFFFFF" : "currentColor";
  const productColor = onDark ? p.colorOnDark : p.color;
  if (variant === "symbol") return <HeecaSymbol h={ink} size={size} title={p.fullName} className={className} style={style} />;
  const center = variant === "vertical";
  const cap = size * CAP_RATIO;
  const nameStyle: CSSProperties = { fontFamily: UI_FONT, fontWeight: 600, fontSize: cap * 0.33, letterSpacing: "0.18em", lineHeight: 1, color: productColor, textTransform: "uppercase", whiteSpace: "nowrap", marginRight: "-0.18em" };
  const sloganStyle: CSSProperties = { fontFamily: UI_FONT, fontWeight: 400, fontSize: cap * 0.31, lineHeight: 1.35, color: onDark ? "#C9CBD1" : "var(--heeca-text-secondary, #667085)", whiteSpace: "nowrap" };
  return (
    <span className={className} style={{ display: "inline-grid", gap: cap * 0.26, justifyItems: center ? "center" : "start", textAlign: center ? "center" : "left", ...style }} aria-label={p.fullName} role="img">
      <HeecaWordmark ink={ink} height={cap} />
      {p.name ? <span style={nameStyle}>{p.name}</span> : null}
      {slogan ? <span style={sloganStyle}>{SLOGAN}</span> : null}
    </span>
  );
}

/**
 * Ícone de app/produto (o mesmo desenho de dist/icon): fundo na cor da família, pictograma branco e o
 * H pequeno no canto. A plataforma ("heeca") usa fundo Heeca Black com o H e o arco.
 */
export function HeecaAppIcon({ product, size = 48, radius = 22.5, className, style }: { product: HeecaProduct; size?: number; radius?: number; className?: string; style?: CSSProperties }) {
  const p = HEECA_PRODUCTS[product];
  const mark = (h: string, accent: string) => (
    <>
      {G.symbolStems.map((s, i) => <rect key={i} x={s.x} y={0} width={s.w} height={100} fill={h} />)}
      <path d={G.arc} fill={accent} />
    </>
  );
  if (!p.name) {
    const s = 0.6;
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} role="img" aria-label="Heeca">
        <rect width="100" height="100" rx={radius} fill={HEECA_COLORS.black} />
        <g transform={`translate(${((100 - SYMBOL.w * s) / 2).toFixed(2)} ${((100 - SYMBOL.h * s) / 2).toFixed(2)}) scale(${s})`}>{mark("#FFFFFF", RED)}</g>
      </svg>
    );
  }
  const picto = HEECA_PICTOGRAMS[product];
  const gid = `hg-${product}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} role="img" aria-label={p.fullName}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stopColor={p.color} stopOpacity={0.86} /><stop offset="1" stopColor={p.color} /></linearGradient>
        <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity={0.16} /><stop offset="0.5" stopColor="#fff" stopOpacity={0} /></linearGradient>
      </defs>
      <rect width="100" height="100" rx={radius} fill={p.color} />
      <rect width="100" height="100" rx={radius} fill={`url(#${gid})`} />
      <rect width="100" height="100" rx={radius} fill={`url(#${gid}-s)`} />
      {picto ? (
        <g transform="translate(21 15) scale(2.3333)" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: picto }} />
      ) : (
        <text x="50" y="64" textAnchor="middle" fontFamily={UI_FONT} fontWeight={600} fontSize={p.sigla.length > 2 ? 40 : 50} fill="#fff">{p.sigla}</text>
      )}
      <g transform="translate(66 74) scale(0.2)" opacity={0.95}>{mark("#fff", "#fff")}</g>
    </svg>
  );
}

/**
 * Abertura animada (~2,5 s): hastes sobem · o arco varre e conecta · E, E, C, A entram · nome · slogan.
 * Respeita prefers-reduced-motion (mostra o estado final). Use em splash/login; não em cabeçalhos.
 */
export function LogoIntro({ product = "heeca", onDark = true, size = 64, slogan = true, className, style }: Omit<LogoProps, "variant">) {
  const p = HEECA_PRODUCTS[product];
  const ink = onDark ? "#FFFFFF" : "currentColor";
  const productColor = onDark ? p.colorOnDark : p.color;
  const cap = size * CAP_RATIO;
  const css = ` .hi-0{opacity:0;transform-box:fill-box;transform-origin:50% 100%;animation:hi-up .5s cubic-bezier(.2,.8,.2,1) .1s forwards} .hi-arc{clip-path:inset(0 100% 0 0);animation:hi-sweep .7s cubic-bezier(.4,0,.2,1) .55s forwards} .hi-1,.hi-2,.hi-3,.hi-4,.hi-n,.hi-s{opacity:0;animation:hi-rise .4s ease-out forwards} .hi-1{animation-delay:1.15s}.hi-2{animation-delay:1.27s}.hi-3{animation-delay:1.39s}.hi-4{animation-delay:1.51s} .hi-n{animation-delay:1.8s}.hi-s{animation-delay:2s;animation-duration:.6s} @keyframes hi-up{from{opacity:0;transform:scaleY(.2)}to{opacity:1;transform:none}} @keyframes hi-sweep{to{clip-path:inset(0 0 0 0)}} @keyframes hi-rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}} @media (prefers-reduced-motion:reduce){[class^="hi-"]{animation:none!important;opacity:1!important;transform:none!important;clip-path:none!important}} `;
  return (
    <span className={className} style={{ display: "inline-grid", gap: cap * 0.26, justifyItems: "start", ...style }} aria-label={p.fullName} role="img">
      <style>{css}</style>
      <HeecaWordmark ink={ink} height={cap} cls="hi-" />
      {p.name ? <span className="hi-n" style={{ fontFamily: UI_FONT, fontWeight: 600, fontSize: cap * 0.33, letterSpacing: "0.18em", lineHeight: 1, color: productColor, textTransform: "uppercase", whiteSpace: "nowrap" }}>{p.name}</span> : null}
      {slogan ? <span className="hi-s" style={{ fontFamily: UI_FONT, fontWeight: 400, fontSize: cap * 0.31, lineHeight: 1.35, color: onDark ? "#C9CBD1" : "var(--heeca-text-secondary, #667085)", whiteSpace: "nowrap" }}>{SLOGAN}</span> : null}
    </span>
  );
}
