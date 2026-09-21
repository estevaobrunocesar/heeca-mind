/**
 * Gráficos do painel em SVG puro (sem biblioteca): área com curva suave, rosca, mini-gráfico e anel de meta.
 * Todos aceitam a cor por classe/var CSS para seguir o acento da família (brand) ou uma cor semântica.
 */

/** Caminho suave (Catmull-Rom → Bézier) por pontos já em coordenadas do SVG. */
function suave(pts: [number, number][]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0][0]} ${pts[0][1]}` : "";
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x} ${c1y},${c2x} ${c2y},${p2[0]} ${p2[1]}`;
  }
  return d;
}

export function Sparkline({ values, color = "var(--color-brand-600)", id }: { values: number[]; color?: string; id: string }) {
  const w = 120, h = 34, max = Math.max(1, ...values), n = Math.max(values.length, 2);
  const pts = values.map((v, i): [number, number] => [(i / (n - 1)) * w, h - 4 - (v / max) * (h - 10)]);
  const linha = suave(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[34px] w-full" aria-hidden>
      <defs><linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".22" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {pts.length > 1 && <path d={`${linha} V${h} H0 Z`} fill={`url(#sp-${id})`} />}
      <path d={linha} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type Ponto = { rotulo: string; valor: number; destaque?: string };

/** Área com eixo Y em 4 linhas, rótulos do X e um destaque no maior ponto. */
export function AreaChart({ pontos, formato, cor = "var(--color-brand-600)" }: { pontos: Ponto[]; formato: (v: number) => string; cor?: string }) {
  const W = 560, H = 190, L = 44, R = 8, T = 22, B = 24;
  const max = Math.max(1, ...pontos.map((p) => p.valor));
  const teto = Math.ceil(max / 4) * 4 || 4;
  const n = Math.max(pontos.length, 2);
  const x = (i: number) => L + (i / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / teto) * (H - T - B);
  const pts = pontos.map((p, i): [number, number] => [x(i), y(p.valor)]);
  const linha = suave(pts);
  const iMax = pontos.reduce((m, p, i) => (p.valor > pontos[m].valor ? i : m), 0);
  const rotulos = pontos.filter((_, i) => i === 0 || i === pontos.length - 1 || i % Math.max(1, Math.floor(pontos.length / 5)) === 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[190px] w-full" role="img" aria-label="Gráfico">
      <defs><linearGradient id="area-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={cor} stopOpacity=".26" /><stop offset="1" stopColor={cor} stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map((k) => {
        const v = (teto / 4) * k, yy = y(v);
        return (
          <g key={k}>
            <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="var(--color-line-2)" />
            <text x={L - 6} y={yy + 3.5} textAnchor="end" fontSize="9.5" fill="var(--color-mut-2)">{formato(v)}</text>
          </g>
        );
      })}
      {pontos.length > 1 && <path d={`${linha} V${y(0)} H${x(0)} Z`} fill="url(#area-g)" />}
      <path d={linha} fill="none" stroke={cor} strokeWidth="2.5" />
      {pontos.length > 0 && pontos[iMax].valor > 0 && (
        <g>
          <circle cx={x(iMax)} cy={y(pontos[iMax].valor)} r="4" fill={cor} stroke="#fff" strokeWidth="2" />
          <rect x={Math.min(W - R - 84, Math.max(L, x(iMax) - 42))} y={Math.max(0, y(pontos[iMax].valor) - 36)} width="84" height="28" rx="7" fill="#fff" stroke="var(--color-line)" />
          <text x={Math.min(W - R - 42, Math.max(L + 42, x(iMax)))} y={Math.max(0, y(pontos[iMax].valor) - 36) + 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-ink)">{pontos[iMax].destaque ?? formato(pontos[iMax].valor)}</text>
          <text x={Math.min(W - R - 42, Math.max(L + 42, x(iMax)))} y={Math.max(0, y(pontos[iMax].valor) - 36) + 23} textAnchor="middle" fontSize="9" fill="var(--color-mut-2)">{pontos[iMax].rotulo}</text>
        </g>
      )}
      {rotulos.map((p) => {
        const i = pontos.indexOf(p);
        return <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"} fontSize="9.5" fill="var(--color-mut-2)">{p.rotulo}</text>;
      })}
    </svg>
  );
}

export type Fatia = { rotulo: string; valor: number; cor: string };

/** Rosca com total no centro e legenda ao lado. */
export function Donut({ fatias, totalRotulo }: { fatias: Fatia[]; totalRotulo: string }) {
  const total = fatias.reduce((n, f) => n + f.valor, 0) || 1;
  const C = 2 * Math.PI * 44;
  // Comprimento e deslocamento de cada fatia calculados antes de renderizar (nada de mutar durante o map)
  const arcos = fatias.reduce<{ f: Fatia; len: number; offset: number }[]>((acc, f) => {
    const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].len : 0;
    return [...acc, { f, len: (f.valor / total) * C, offset }];
  }, []);
  return (
    <div className="grid grid-cols-[112px_1fr] items-center gap-3">
      <svg viewBox="0 0 120 120" className="size-28" role="img" aria-label="Distribuição">
        <circle cx="60" cy="60" r="44" fill="none" stroke="var(--color-line-2)" strokeWidth="16" />
        {arcos.map(({ f, len, offset }) => (
          <circle key={f.rotulo} cx="60" cy="60" r="44" fill="none" stroke={f.cor} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />
        ))}
        <text x="60" y="57" textAnchor="middle" fontSize="9" fill="var(--color-mut)">Total</text>
        <text x="60" y="71" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ink)">{totalRotulo}</text>
      </svg>
      <ul className="m-0 list-none p-0 text-xs">
        {fatias.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2 py-0.5">
            <i className="inline-block size-2 rounded-full" style={{ background: f.cor }} />
            <span className="min-w-0 flex-1 truncate">{f.rotulo}</span>
            <b className="font-semibold">{Math.round((f.valor / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Anel de progresso (meta do mês). */
export function Ring({ pct, size = 112 }: { pct: number; size?: number }) {
  const p = Math.max(0, Math.min(100, pct));
  const C = 2 * Math.PI * 48;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={`${Math.round(p)}%`}>
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--color-line-2)" strokeWidth="11" />
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--color-brand-600)" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(p / 100) * C} ${C}`} transform="rotate(-90 60 60)" />
      <text x="60" y="67" textAnchor="middle" fontSize="24" fontWeight="600" fill="var(--color-ink)">{Math.round(p)}%</text>
    </svg>
  );
}

/** Paleta semântica das fatias (a primeira é o acento da família). */
export const CORES_FATIAS = ["var(--color-brand-600)", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#a1a1aa"];
