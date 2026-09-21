/**
 * Marca Heeca — componente compartilhado entre o portal e os produtos.
 * GERADO por brand/build.mjs a partir de brand/geometry.mjs — não edite; rode `pnpm build` em brand/.
 *
 * Símbolo: duas hastes (H) + swoosh que é a barra do H e vira o braço superior do C + C atrás da haste direita.
 * Cores: partes do H em `currentColor` por padrão (seguem o tema); `onDark` força a prata do kit;
 * a cor do produto é fixa. Wordmark "Heeca": "Hee" na cor do H, "ca" na cor do produto (texto,
 * Montserrat via --font-brand — o app define a variável com next/font, pesos 300/500/700).
 *
 *   <Logo product="ticket" />                    símbolo + "Heeca Ticket"   (cabeçalho, sidebar)
 *   <Logo product="ticket" variant="vertical" /> símbolo sobre o nome       (login) — slogan opcional
 *   <Logo product="ticket" variant="symbol" />   só o símbolo               (avatar, favicon inline)
 *   <LogoIntro product="ticket" />               animação de abertura (H → C → conexão → nome)
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
};

/** Famílias (a cor é da família; os produtos herdam). Fonte: brand/products.mjs. */
export const HEECA_FAMILIES = {
  platform: { label: "Plataforma", color: "#e50914", onDark: "#e50914" },
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
} as const;
export type HeecaFamily = keyof typeof HEECA_FAMILIES;

/** Produtos (fonte: brand/products.csv). sigla é única na plataforma; color = cor da família. */
export const HEECA_PRODUCTS = {
  "heeca": { name: "", color: "#e50914", fullName: "Heeca", colorOnDark: "#e50914", family: "platform", engine: "Core", sigla: "" },
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
} as const;
export type HeecaProduct = keyof typeof HEECA_PRODUCTS;
export const SLOGAN = "Sistemas que fazem o seu negócio evoluir.";

const SILVER = "#d4d6db";
const VIEW = { w: 126, h: 100 };
const SW = 17;
const D = {
  cBase: "M104.26 23.81A30 30 0 1 0 114.07 74.29",
  topArm: "M104.26 23.81A30 30 0 0 1 114.07 29.71",
  swoosh: "M14.79 69.41L16.68 69.2L18.58 68.81L20.5 68.29L22.43 67.68L24.39 66.97L26.36 66.18L28.34 65.31L30.34 64.38L32.35 63.38L34.38 62.33L36.41 61.22L38.46 60.07L40.51 58.88L42.58 57.66L44.65 56.41L46.73 55.13L48.81 53.83L50.89 52.52L52.97 51.21L55.05 49.89L57.13 48.57L59.2 47.27L61.27 45.97L63.32 44.7L65.37 43.44L67.4 42.22L69.42 41.04L71.41 39.89L73.39 38.79L75.34 37.74L77.27 36.74L79.16 35.81L81.02 34.94L82.83 34.14L84.61 33.42L86.33 32.79L88 32.23L89.62 31.76L91.16 31.38L92.63 31.1L94.03 30.9L95.34 30.8L96.55 30.78L97.68 30.84L98.72 30.98L99.67 31.19L100.54 31.46L101.35 31.8L107.17 15.82L104.88 15.19L102.59 14.76L100.29 14.53L98.01 14.48L95.76 14.59L93.53 14.85L91.33 15.25L89.16 15.76L87.01 16.39L84.88 17.12L82.77 17.93L80.68 18.83L78.6 19.8L76.52 20.85L74.46 21.95L72.4 23.12L70.35 24.34L68.3 25.6L66.25 26.91L64.22 28.26L62.18 29.64L60.15 31.05L58.13 32.49L56.11 33.94L54.1 35.41L52.1 36.89L50.11 38.38L48.13 39.86L46.15 41.34L44.2 42.81L42.25 44.27L40.33 45.71L38.42 47.12L36.53 48.51L34.66 49.86L32.81 51.18L30.99 52.45L29.2 53.68L27.43 54.85L25.7 55.97L23.99 57.03L22.33 58.02L20.7 58.94L19.11 59.8L17.56 60.59L16.06 61.3L14.61 61.95L13.21 62.59Z",
  swooshCenter: "M14 66C40 60 79.83 14.92 104.26 23.81",
};

type SymbolProps = { h?: string; accent: string; size?: number; title?: string; className?: string; style?: CSSProperties };

/** Símbolo em malha 126 × 100 (sem área de respiro). `size` = altura em px. */
export function HeecaSymbol({ h = "currentColor", accent, size = 32, title, className, style }: SymbolProps) {
  return (
    <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} height={size} width={(size * VIEW.w) / VIEW.h} className={className} style={style} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <path d={D.cBase} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round" />
      <rect x={10} y={6} width={17} height={88} rx={1.5} fill={h} />
      <rect x={62} y={6} width={17} height={88} rx={1.5} fill={h} />
      <path d={D.swoosh} fill={accent} />
      <path d={D.topArm} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round" />
    </svg>
  );
}

export type LogoProps = {
  product?: HeecaProduct;
  variant?: "horizontal" | "vertical" | "symbol";
  /** Superfície sempre escura: partes do H na prata do kit. */
  onDark?: boolean;
  /** Mostra o slogan sob o wordmark (só em tamanhos grandes: login, materiais). */
  slogan?: boolean;
  /** Altura do símbolo em px. */
  size?: number;
  className?: string;
  style?: CSSProperties;
};

const BRAND_FONT = "var(--font-brand)";

export function Logo({ product = "heeca", variant = "horizontal", onDark = false, slogan = false, size = 32, className, style }: LogoProps) {
  const p = HEECA_PRODUCTS[product];
  const h = onDark ? SILVER : "currentColor";
  const accent = onDark ? p.colorOnDark : p.color;
  const fontSize = (size * 0.62) / 0.7; // maiúsculas = 62 % da altura do símbolo
  const wordmark: CSSProperties = { fontFamily: BRAND_FONT, fontWeight: 700, fontSize, letterSpacing: "-0.03em", lineHeight: 1, color: h, whiteSpace: "nowrap" };
  const sloganStyle: CSSProperties = { fontFamily: BRAND_FONT, fontWeight: 300, fontSize: fontSize * 0.29, letterSpacing: "0.06em", lineHeight: 1.3, color: h, opacity: 0.9 };
  const name = (
    <>
      Hee<span style={{ color: accent }}>ca</span>
      {p.name ? <> <span style={{ fontWeight: 500, color: accent }}>{p.name}</span></> : null}
    </>
  );
  if (variant === "symbol") return <HeecaSymbol h={h} accent={accent} size={size} title={p.fullName} className={className} style={style} />;
  if (variant === "vertical") {
    return (
      <span className={className} style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: size * 0.08, textAlign: "center", ...style }} aria-label={p.fullName} role="img">
        <HeecaSymbol h={h} accent={accent} size={size} />
        <span style={{ ...wordmark, fontSize: fontSize * 0.9 }}>{name}</span>
        {slogan ? <span style={{ ...sloganStyle, fontSize: fontSize * 0.26, maxWidth: size * 2.4 }}>{SLOGAN}</span> : null}
      </span>
    );
  }
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.1, ...style }} aria-label={p.fullName} role="img">
      <HeecaSymbol h={h} accent={accent} size={size} />
      <span style={{ display: "grid", gap: fontSize * 0.12 }}>
        <span style={wordmark}>{name}</span>
        {slogan ? <span style={sloganStyle}>{SLOGAN}</span> : null}
      </span>
    </span>
  );
}

/**
 * Ícone de app/produto (o mesmo desenho de dist/icon): fundo na cor da família, sigla branca e o
 * símbolo HC pequeno. A plataforma ("heeca") usa fundo escuro com o símbolo grande.
 * Uso: mapa do ecossistema, seletor de produtos, avatar do produto em listas.
 */
export function HeecaAppIcon({ product, size = 48, radius = 22.5, className, style }: { product: HeecaProduct; size?: number; radius?: number; className?: string; style?: CSSProperties }) {
  const p = HEECA_PRODUCTS[product];
  if (!p.name) {
    const s = 0.62;
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className} style={style} role="img" aria-label="Heeca">
        <rect width="100" height="100" rx={radius} fill="#0a0a0a" />
        <g transform={`translate(${((100 - VIEW.w * s) / 2).toFixed(2)} ${((100 - VIEW.h * s) / 2).toFixed(2)}) scale(${s})`}>
          <path d={D.cBase} fill="none" stroke={p.color} strokeWidth={SW} strokeLinecap="round" />
          <rect x={10} y={6} width={17} height={88} rx={1.5} fill={SILVER} />
          <rect x={62} y={6} width={17} height={88} rx={1.5} fill={SILVER} />
          <path d={D.swoosh} fill={p.color} />
          <path d={D.topArm} fill="none" stroke={p.color} strokeWidth={SW} strokeLinecap="round" />
        </g>
      </svg>
    );
  }
  const fs = p.sigla.length > 2 ? 40 : 50;
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
        <g transform="translate(21 17) scale(2.4167)" fill="none" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: picto }} />
      ) : (
        <text x="47" y="66" textAnchor="middle" fontFamily={BRAND_FONT} fontWeight={700} fontSize={fs} letterSpacing="-0.04em" fill="#fff">{p.sigla}</text>
      )}
      <g transform="translate(70 77) scale(0.17)" opacity={0.95}>
        <path d={D.cBase} fill="none" stroke="#fff" strokeWidth={SW} strokeLinecap="round" />
        <rect x={10} y={6} width={17} height={88} rx={1.5} fill="#fff" />
        <rect x={62} y={6} width={17} height={88} rx={1.5} fill="#fff" />
        <path d={D.swoosh} fill="#fff" />
        <path d={D.topArm} fill="none" stroke="#fff" strokeWidth={SW} strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Abertura animada (~3,5 s): 1. H surge · 2. C se forma · 3. conexão (swoosh) · 4. nome revela.
 * Respeita prefers-reduced-motion (mostra o estado final). Use em splash/login; não em cabeçalhos.
 */
export function LogoIntro({ product = "heeca", onDark = true, size = 96, slogan = true, className, style }: Omit<LogoProps, "variant">) {
  const p = HEECA_PRODUCTS[product];
  const h = onDark ? SILVER : "currentColor";
  const accent = onDark ? p.colorOnDark : p.color;
  const fontSize = (size * 0.62) / 0.7;
  const letters: [string, string][] = [["H", h], ["e", h], ["e", h], ["c", accent], ["a", accent]];
  const css = `
    .hi-stem,.hi-rstem{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0)}
    .hi-c,.hi-arm{stroke-dasharray:200;stroke-dashoffset:200}
    .hi-mask{stroke-dasharray:160;stroke-dashoffset:160}
    .hi-l,.hi-slogan{opacity:0}
    .hi-stem{animation:hi-up .55s cubic-bezier(.2,.8,.2,1) .1s forwards}
    .hi-rstem{animation:hi-up .55s cubic-bezier(.2,.8,.2,1) .25s forwards}
    .hi-c{animation:hi-draw .8s cubic-bezier(.4,0,.2,1) 1s forwards}
    .hi-mask{animation:hi-draw .75s cubic-bezier(.4,0,.2,1) 1.8s forwards}
    .hi-arm{animation:hi-draw .35s ease-out 2.4s forwards}
    .hi-l{animation:hi-rise .4s ease-out forwards}
    .hi-slogan{animation:hi-fade .6s ease-out 3.4s forwards}
    @keyframes hi-up{to{transform:scaleY(1)}}
    @keyframes hi-draw{to{stroke-dashoffset:0}}@keyframes hi-rise{from{opacity:0;transform:translateY(.06em)}to{opacity:1;transform:none}}@keyframes hi-fade{to{opacity:1}}
    @media (prefers-reduced-motion:reduce){.hi-stem,.hi-rstem,.hi-c,.hi-arm,.hi-mask,.hi-l,.hi-slogan{animation:none!important}.hi-stem,.hi-rstem,.hi-c,.hi-arm,.hi-l,.hi-slogan{opacity:1;transform:none;stroke-dashoffset:0}.hi-mask{stroke-dashoffset:0}}
  `;
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.1, ...style }} aria-label={p.fullName} role="img">
      <style>{css}</style>
      <svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} height={size} width={(size * VIEW.w) / VIEW.h} aria-hidden="true">
        <defs><mask id="hi-sw"><path className="hi-mask" d={D.swooshCenter} fill="none" stroke="#fff" strokeWidth={24} strokeLinecap="round" /></mask></defs>
        <path className="hi-c" d={D.cBase} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round" />
        <rect className="hi-stem" x={10} y={6} width={17} height={88} rx={1.5} fill={h} />
        <rect className="hi-rstem" x={62} y={6} width={17} height={88} rx={1.5} fill={h} />
        <g mask="url(#hi-sw)"><path d={D.swoosh} fill={accent} /></g>
        <path className="hi-arm" d={D.topArm} fill="none" stroke={accent} strokeWidth={SW} strokeLinecap="round" />
      </svg>
      <span style={{ display: "grid", gap: fontSize * 0.12 }}>
        <span style={{ fontFamily: BRAND_FONT, fontWeight: 700, fontSize, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "nowrap" }}>
          {letters.map(([ch, color], i) => <span key={i} className="hi-l" style={{ display: "inline-block", color, animationDelay: `${2.7 + i * 0.1}s` }}>{ch}</span>)}
          {p.name ? <span className="hi-l" style={{ display: "inline-block", fontWeight: 500, color: accent, animationDelay: "3.2s" }}>&nbsp;{p.name}</span> : null}
        </span>
        {slogan ? <span className="hi-slogan" style={{ fontFamily: BRAND_FONT, fontWeight: 300, fontSize: fontSize * 0.29, letterSpacing: "0.06em", lineHeight: 1.3, color: h }}>{SLOGAN}</span> : null}
      </span>
    </span>
  );
}
