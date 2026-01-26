// @ts-ignore

// ========= Helpers de geração de formas abstratas =========

export function generateBlobSvgDataUrl(opts: { size?: number; seed?: number; fill?: string; stroke?: string; strokeWidth?: number; }): string {
  const size = opts.size ?? 256;
  const seed = opts.seed ?? Math.floor(Math.random() * 100000);
  const fill = opts.fill ?? "#ddd";
  const stroke = opts.stroke ?? "#222";
  const sw = opts.strokeWidth ?? 2;

  // PRNG simples
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0xffffffff);

  const cx = size / 2;
  const cy = size / 2;
  const baseR = size * 0.35;
  const pts: Array<{x:number;y:number}> = [];
  const n = 10 + Math.floor(rnd() * 8); // 10..17 pontos
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = baseR * (0.75 + rnd() * 0.6);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }

  // Suavização por curvas quadráticas entre midpoints
  const mid = (p: any, q: any) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const m1 = mid(p0, p1);
    const m2 = mid(p1, p2);
    if (i === 0) d += `M ${m1.x.toFixed(1)} ${m1.y.toFixed(1)} `;
    d += `Q ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ${m2.x.toFixed(1)} ${m2.y.toFixed(1)} `;
  }
  d += "Z";

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>
    <path d='${d}' fill='${fill}' stroke='${stroke}' stroke-width='${sw}' />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}


