// @ts-ignore
import GeoPattern from "geopattern";

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

export type PatternType = "dots"|"stripes"|"grid"|"zigzag"|"triangles"|"hex"|"diagonal"|"chevron"|"plus"|"cross"|"diamonds"|"waves"|"scallop"|"concentric"|"herringbone"|"plaid"|"halftone"|"checkerboard"|"isometric"|"bricks"|"maze"|"circles";

export function generatePatternSvgDataUrl(opts: { pattern: PatternType; size?: number; bg?: string; fg?: string; }): string {
  const size = opts.size ?? 512;
  const bg = opts.bg ?? "#ffffff";
  const fg = opts.fg ?? "#111111";
  const tile = 64;
  const patternId = `p_${Math.random().toString(36).slice(2)}`;

  let patternContent = "";
  switch (opts.pattern) {
    case "dots":
      patternContent = Array.from({ length: 16 })
        .map((_, i) => {
          const x = (i % 4) * 16 + 8;
          const y = Math.floor(i / 4) * 16 + 8;
          return `<circle cx='${x}' cy='${y}' r='2.5' fill='${fg}' />`;
        })
        .join("");
      break;
    case "stripes":
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` +
        Array.from({ length: 8 }).map((_, i) => `<rect x='0' y='${i * 8}' width='${tile}' height='4' fill='${fg}' opacity='0.9' />`).join("");
      break;
    case "grid":
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` +
        Array.from({ length: 9 }).map((_, i) => `<line x1='${i * 8}' y1='0' x2='${i * 8}' y2='${tile}' stroke='${fg}' stroke-width='1' opacity='0.6' />`).join("") +
        Array.from({ length: 9 }).map((_, i) => `<line x1='0' y1='${i * 8}' x2='${tile}' y2='${i * 8}' stroke='${fg}' stroke-width='1' opacity='0.6' />`).join("");
      break;
    case "zigzag":
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` +
        `<path d='M0 16 L8 8 L16 16 L24 8 L32 16 L40 8 L48 16 L56 8' fill='none' stroke='${fg}' stroke-width='2' />` +
        `<path d='M0 40 L8 32 L16 40 L24 32 L32 40 L40 32 L48 40 L56 32' fill='none' stroke='${fg}' stroke-width='2' />`;
      break;
    case "triangles":
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` +
        Array.from({ length: 4 }).map((_, r) =>
          Array.from({ length: 4 }).map((_, c) => {
            const x = c * 16, y = r * 16;
            return `<path d='M ${x} ${y+16} L ${x+8} ${y} L ${x+16} ${y+16} Z' fill='${fg}' opacity='${0.6 + ((r+c)%2)*0.2}' />`;
          }).join("")
        ).join("");
      break;
    case "hex": {
      const h = 8;
      const hex = (cx: number, cy: number) => {
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i;
          return `${(cx + Math.cos(a) * h).toFixed(1)} ${(cy + Math.sin(a) * h).toFixed(1)}`;
        }).join(" ");
        return `<polygon points='${pts}' fill='none' stroke='${fg}' stroke-width='1.2' opacity='0.8' />`;
      };
      let hexes = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          const cx = (c + (r % 2 ? 0.5 : 0)) * 10 + 5;
          const cy = r * 8 + 6;
          hexes += hex(cx, cy);
        }
      }
      patternContent = hexes;
      break;
    }
    case "diagonal": {
      const step = 8;
      let lines = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let k = -tile; k <= tile; k += step) {
        lines += `<line x1='${k}' y1='0' x2='${k + tile}' y2='${tile}' stroke='${fg}' stroke-width='2' opacity='0.8' />`;
      }
      patternContent = lines;
      break;
    }
    case "chevron": {
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` +
        `<path d='M0 16 L8 8 L16 16 L24 8 L32 16 L40 8 L48 16 L56 8 L64 16' fill='none' stroke='${fg}' stroke-width='3' />` +
        `<path d='M0 48 L8 40 L16 48 L24 40 L32 48 L40 40 L48 48 L56 40 L64 48' fill='none' stroke='${fg}' stroke-width='3' />`;
      break;
    }
    case "plus": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 4; r < tile; r += 16) {
        for (let c = 4; c < tile; c += 16) {
          svg += `<line x1='${c-3}' y1='${r}' x2='${c+3}' y2='${r}' stroke='${fg}' stroke-width='2' />`;
          svg += `<line x1='${c}' y1='${r-3}' x2='${c}' y2='${r+3}' stroke='${fg}' stroke-width='2' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "cross": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 6; r < tile; r += 16) {
        for (let c = 6; c < tile; c += 16) {
          svg += `<line x1='${c-3}' y1='${r-3}' x2='${c+3}' y2='${r+3}' stroke='${fg}' stroke-width='2' />`;
          svg += `<line x1='${c+3}' y1='${r-3}' x2='${c-3}' y2='${r+3}' stroke='${fg}' stroke-width='2' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "diamonds": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 8; r < tile; r += 16) {
        for (let c = 8; c < tile; c += 16) {
          svg += `<rect x='${c-4}' y='${r-4}' width='8' height='8' fill='none' stroke='${fg}' stroke-width='1.2' transform='rotate(45 ${c} ${r})' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "waves": {
      const wave = (y: number) => `<path d='M0 ${y} C 8 ${y-4}, 8 ${y+4}, 16 ${y} S 32 ${y}, 48 ${y} S 64 ${y}, 80 ${y}' fill='none' stroke='${fg}' stroke-width='2' />`;
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />` + wave(16) + wave(32) + wave(48);
      break;
    }
    case "scallop": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let y = 8; y <= tile; y += 16) {
        for (let x = 0; x <= tile; x += 16) {
          svg += `<path d='M ${x-8} ${y} A 8 8 0 0 0 ${x+8} ${y}' fill='none' stroke='${fg}' stroke-width='2' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "concentric": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 8; r < tile; r += 16) {
        for (let c = 8; c < tile; c += 16) {
          svg += `<circle cx='${c}' cy='${r}' r='5' fill='none' stroke='${fg}' stroke-width='1.2' />`;
          svg += `<circle cx='${c}' cy='${r}' r='2' fill='${fg}' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "herringbone": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let y = 0; y < tile; y += 16) {
        for (let x = 0; x < tile; x += 32) {
          svg += `<rect x='${x}' y='${y}' width='16' height='4' fill='${fg}' opacity='0.8' />`;
          svg += `<rect x='${x+16}' y='${y+4}' width='4' height='12' fill='${fg}' opacity='0.8' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "plaid": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      svg += `<line x1='0' y1='8' x2='${tile}' y2='8' stroke='${fg}' stroke-width='2' opacity='0.6' />`;
      svg += `<line x1='0' y1='24' x2='${tile}' y2='24' stroke='${fg}' stroke-width='4' opacity='0.4' />`;
      svg += `<line x1='0' y1='48' x2='${tile}' y2='48' stroke='${fg}' stroke-width='2' opacity='0.6' />`;
      svg += `<line x1='8' y1='0' x2='8' y2='${tile}' stroke='${fg}' stroke-width='2' opacity='0.6' />`;
      svg += `<line x1='24' y1='0' x2='24' y2='${tile}' stroke='${fg}' stroke-width='4' opacity='0.4' />`;
      svg += `<line x1='48' y1='0' x2='48' y2='${tile}' stroke='${fg}' stroke-width='2' opacity='0.6' />`;
      patternContent = svg;
      break;
    }
    case "halftone": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const rad = 1 + ((r + c) % 4) * 0.5;
          svg += `<circle cx='${c * 8 + 4}' cy='${r * 8 + 4}' r='${rad}' fill='${fg}' opacity='0.7' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "checkerboard": {
      patternContent = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if ((r + c) % 2 === 0) {
            patternContent += `<rect x='${c * 16}' y='${r * 16}' width='16' height='16' fill='${fg}' opacity='0.8' />`;
          }
        }
      }
      break;
    }
    case "isometric": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let i = 0; i < 4; i++) {
        const x = i * 16;
        svg += `<path d='M ${x+8} 0 L ${x+16} 8 L ${x+8} 16 L ${x} 8 Z' fill='none' stroke='${fg}' stroke-width='1.5' />`;
        svg += `<path d='M ${x+8} 32 L ${x+16} 40 L ${x+8} 48 L ${x} 40 Z' fill='none' stroke='${fg}' stroke-width='1.5' />`;
      }
      patternContent = svg;
      break;
    }
    case "bricks": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 0; r < 4; r++) {
        const offset = (r % 2) * 16;
        for (let c = 0; c < 4; c++) {
          const x = (c * 32 + offset) % tile;
          const y = r * 16;
          svg += `<rect x='${x}' y='${y}' width='30' height='14' fill='none' stroke='${fg}' stroke-width='1.5' />`;
        }
      }
      patternContent = svg;
      break;
    }
    case "maze": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      const walls = [
        "M8 0 L8 16", "M24 8 L24 24", "M40 0 L40 16", "M56 8 L56 24",
        "M0 8 L16 8", "M32 8 L48 8", "M16 24 L32 24", "M48 24 L64 24",
        "M8 32 L8 48", "M24 40 L24 56", "M40 32 L40 48", "M56 40 L56 56",
        "M0 40 L16 40", "M32 40 L48 40", "M16 56 L32 56", "M48 56 L64 56"
      ];
      walls.forEach(w => { svg += `<path d='${w}' stroke='${fg}' stroke-width='2' />`; });
      patternContent = svg;
      break;
    }
    case "circles": {
      let svg = `<rect x='0' y='0' width='${tile}' height='${tile}' fill='${bg}' />`;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          svg += `<circle cx='${c * 16 + 8}' cy='${r * 16 + 8}' r='6' fill='none' stroke='${fg}' stroke-width='1.5' opacity='0.7' />`;
        }
      }
      patternContent = svg;
      break;
    }
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
    <defs>
      <pattern id='${patternId}' patternUnits='userSpaceOnUse' width='${tile}' height='${tile}'>
        ${patternContent}
      </pattern>
    </defs>
    <rect width='100%' height='100%' fill='url(#${patternId})' />
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export type ScribbleType = "wave"|"waves2"|"spiral"|"scribble-circle"|"scribble-rect"|"scribble-star"|"scribble-heart"|"hatch"|"scribble-zigzag"|"arrow"|"lightning"|"cloud"|"starburst"|"flower"|"leaf";

export function generateScribblePngDataUrl(opts: { kind: ScribbleType; size?: number; stroke?: string; background?: string; }): string {
  const size = opts.size ?? 480;
  const stroke = opts.stroke ?? "#111";
  const bg = opts.background ?? "transparent";
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  if (bg !== "transparent") {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
  } else {
    ctx.clearRect(0, 0, size, size);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(2, Math.floor(size / 120));

  const jitter = (v: number) => v + (Math.random() - 0.5) * (size * 0.01);

  if (opts.kind === "wave") {
    ctx.beginPath();
    for (let y = size * 0.2; y <= size * 0.8; y += size * 0.12) {
      ctx.moveTo(0, jitter(y));
      for (let x = 0; x <= size; x += size / 24) {
        const amp = size * 0.03 + (Math.random() * size * 0.01);
        const yy = y + Math.sin((x / size) * Math.PI * 2 * 2) * amp + (Math.random() - 0.5) * 2;
        ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
  } else if (opts.kind === "waves2") {
    ctx.beginPath();
    for (let y = size * 0.25; y <= size * 0.75; y += size * 0.1) {
      ctx.moveTo(0, jitter(y));
      for (let x = 0; x <= size; x += size / 32) {
        const amp = size * 0.02 + (Math.random() * size * 0.01);
        const yy = y + Math.sin((x / size) * Math.PI * 2 * 4) * amp + (Math.random() - 0.5) * 2;
        ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
  } else if (opts.kind === "spiral") {
    ctx.beginPath();
    const cx = size / 2, cy = size / 2;
    let r = size * 0.05;
    for (let a = 0; a < Math.PI * 8; a += 0.2) {
      const x = cx + Math.cos(a) * r + (Math.random() - 0.5) * 2;
      const y = cy + Math.sin(a) * r + (Math.random() - 0.5) * 2;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      r += size * 0.005;
    }
    ctx.stroke();
  } else if (opts.kind === "scribble-circle") {
    const cx = size / 2, cy = size / 2, r = size * 0.3;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.12) {
        const rr = r + (Math.random() - 0.5) * (size * 0.02);
        const x = cx + Math.cos(a) * rr + (Math.random() - 0.5) * 2;
        const y = cy + Math.sin(a) * rr + (Math.random() - 0.5) * 2;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (opts.kind === "scribble-rect") {
    const pad = size * 0.18;
    const x0 = pad, y0 = pad, x1 = size - pad, y1 = size - pad;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.moveTo(jitter(x0), jitter(y0));
      ctx.lineTo(jitter(x1), jitter(y0));
      ctx.lineTo(jitter(x1), jitter(y1));
      ctx.lineTo(jitter(x0), jitter(y1));
      ctx.closePath();
      ctx.stroke();
    }
  } else if (opts.kind === "scribble-star") {
    const cx = size / 2, cy = size / 2, r1 = size * 0.32, r2 = size * 0.14;
    const points: Array<{x:number;y:number}> = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = (-Math.PI / 2) + (i * Math.PI / 5);
      points.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const nx = p.x + (Math.random() - 0.5) * (size * 0.01);
        const ny = p.y + (Math.random() - 0.5) * (size * 0.01);
        if (i === 0) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny);
      }
      ctx.closePath();
      ctx.stroke();
    }
  } else if (opts.kind === "scribble-heart") {
    const cx = size / 2, cy = size / 2;
    const scale = size * 0.025;
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      for (let t = -Math.PI; t <= Math.PI + 0.01; t += 0.12) {
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y = 13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t);
        const nx = cx + x * scale + (Math.random() - 0.5) * 2;
        const ny = cy - y * scale + (Math.random() - 0.5) * 2;
        if (t === -Math.PI) ctx.moveTo(nx, ny); else ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }
  } else if (opts.kind === "hatch") {
    ctx.beginPath();
    ctx.lineWidth = Math.max(1.5, ctx.lineWidth - 1);
    for (let x = -size * 0.2; x < size * 1.2; x += size * 0.06) {
      ctx.moveTo(x + (Math.random()-0.5)*3, 0);
      ctx.lineTo(x + size*0.3 + (Math.random()-0.5)*3, size);
    }
    ctx.stroke();
  } else if (opts.kind === "scribble-zigzag") {
    ctx.beginPath();
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const y = size * (0.2 + 0.6 * (r / (rows - 1)));
      const step = size / 16;
      ctx.moveTo(0, jitter(y));
      for (let x = 0; x <= size; x += step) {
        const up = (x / step) % 2 < 1;
        const yy = y + (up ? -size * 0.03 : size * 0.03) + (Math.random() - 0.5) * 2;
        ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
  } else if (opts.kind === "arrow") {
    const cx = size / 2, cy = size / 2;
    const len = size * 0.5;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(jitter(cx - len/2), jitter(cy));
      ctx.lineTo(jitter(cx + len/2), jitter(cy));
      ctx.lineTo(jitter(cx + len/2 - size*0.1), jitter(cy - size*0.08));
      ctx.moveTo(jitter(cx + len/2), jitter(cy));
      ctx.lineTo(jitter(cx + len/2 - size*0.1), jitter(cy + size*0.08));
      ctx.stroke();
    }
  } else if (opts.kind === "lightning") {
    const cx = size / 2, cy = size * 0.2;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      const pts = [
        {x: cx, y: cy},
        {x: cx + size*0.1, y: cy + size*0.25},
        {x: cx - size*0.05, y: cy + size*0.3},
        {x: cx + size*0.08, y: cy + size*0.55},
        {x: cx - size*0.1, y: cy + size*0.6}
      ];
      pts.forEach((p, i) => {
        const x = p.x + (Math.random() - 0.5) * 3;
        const y = p.y + (Math.random() - 0.5) * 3;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  } else if (opts.kind === "cloud") {
    const cx = size / 2, cy = size / 2;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      const bumps = 6;
      for (let i = 0; i <= bumps; i++) {
        const a = (i / bumps) * Math.PI;
        const r = size * 0.2 + (Math.random() * size * 0.05);
        const x = cx + Math.cos(a - Math.PI) * r + (Math.random() - 0.5) * 2;
        const y = cy + Math.sin(a - Math.PI) * r * 0.5 + (Math.random() - 0.5) * 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (opts.kind === "starburst") {
    const cx = size / 2, cy = size / 2;
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const r1 = size * 0.08;
      const r2 = size * 0.35;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1 + (Math.random()-0.5)*2, cy + Math.sin(a) * r1 + (Math.random()-0.5)*2);
        ctx.lineTo(cx + Math.cos(a) * r2 + (Math.random()-0.5)*2, cy + Math.sin(a) * r2 + (Math.random()-0.5)*2);
        ctx.stroke();
      }
    }
  } else if (opts.kind === "flower") {
    const cx = size / 2, cy = size / 2;
    const petals = 6;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const petalR = size * 0.15;
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        const px = cx + Math.cos(a) * petalR;
        const py = cy + Math.sin(a) * petalR;
        for (let t = 0; t <= Math.PI * 2 + 0.1; t += 0.3) {
          const x = px + Math.cos(a + t) * petalR * 0.5 + (Math.random()-0.5)*2;
          const y = py + Math.sin(a + t) * petalR * 0.5 + (Math.random()-0.5)*2;
          if (t === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(cx, cy, size*0.05, 0, Math.PI*2);
    ctx.fill();
  } else if (opts.kind === "leaf") {
    const cx = size / 2, cy = size / 2;
    const w = size * 0.2, h = size * 0.4;
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(jitter(cx), jitter(cy - h/2));
      ctx.quadraticCurveTo(jitter(cx + w), jitter(cy), jitter(cx), jitter(cy + h/2));
      ctx.quadraticCurveTo(jitter(cx - w), jitter(cy), jitter(cx), jitter(cy - h/2));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(jitter(cx), jitter(cy - h/2));
    ctx.lineTo(jitter(cx), jitter(cy + h/2));
    ctx.stroke();
  }
  return canvas.toDataURL("image/png");
}

// Hero Patterns (manual SVG definitions - subset of heropatterns.com)
export const HERO_PATTERNS = [
  "jigsaw", "overcast", "formal-invitation", "topography", "texture", 
  "hideout", "bamboo", "bath", "architect", "autumn"
] as const;

export type HeroPatternType = typeof HERO_PATTERNS[number];

export function generateHeroPatternDataUrl(opts: { pattern: HeroPatternType; bg?: string; fg?: string; size?: number; }): string {
  const bg = opts.bg ?? "#ffffff";
  const fg = opts.fg ?? "#000000";
  const size = opts.size ?? 512;
  
  // Simplified implementations (real hero patterns are more complex)
  let patternSVG = "";
  const tile = 64;
  
  switch (opts.pattern) {
    case "jigsaw":
      patternSVG = `<path d='M0 16 C8 16 8 8 16 8 C24 8 24 16 32 16 C40 16 40 8 48 8 C56 8 56 16 64 16 M0 48 C8 48 8 40 16 40 C24 40 24 48 32 48 C40 48 40 40 48 40 C56 40 56 48 64 48' stroke='${fg}' fill='none' opacity='0.3' />`;
      break;
    case "overcast":
      patternSVG = `<path d='M0 20 C10 10, 20 10, 30 20 C40 30, 50 30, 60 20 M0 50 C10 40, 20 40, 30 50 C40 60, 50 60, 60 50' stroke='${fg}' fill='none' opacity='0.25' />`;
      break;
    case "formal-invitation":
      patternSVG = `<circle cx='8' cy='8' r='3' fill='${fg}' opacity='0.15'/><circle cx='56' cy='8' r='3' fill='${fg}' opacity='0.15'/><circle cx='8' cy='56' r='3' fill='${fg}' opacity='0.15'/><circle cx='56' cy='56' r='3' fill='${fg}' opacity='0.15'/>`;
      break;
    case "topography":
      patternSVG = `<path d='M0 16 Q16 8 32 16 T64 16 M0 32 Q16 24 32 32 T64 32 M0 48 Q16 40 32 48 T64 48' stroke='${fg}' fill='none' opacity='0.2' />`;
      break;
    case "texture":
      patternSVG = Array.from({length: 20}, (_, i) => {
        const x = (i * 13) % tile;
        const y = (i * 17) % tile;
        return `<circle cx='${x}' cy='${y}' r='1' fill='${fg}' opacity='0.3'/>`;
      }).join("");
      break;
    case "hideout":
      patternSVG = `<rect x='0' y='0' width='32' height='32' fill='${fg}' opacity='0.05'/><rect x='32' y='32' width='32' height='32' fill='${fg}' opacity='0.05'/>`;
      break;
    case "bamboo":
      patternSVG = `<line x1='16' y1='0' x2='16' y2='64' stroke='${fg}' opacity='0.2'/><line x1='48' y1='0' x2='48' y2='64' stroke='${fg}' opacity='0.2'/><circle cx='16' cy='16' r='3' fill='${fg}' opacity='0.15'/><circle cx='48' cy='48' r='3' fill='${fg}' opacity='0.15'/>`;
      break;
    case "bath":
      patternSVG = `<path d='M0 8 L8 0 M0 24 L24 0 M0 40 L40 0 M0 56 L56 0 M8 64 L64 8 M24 64 L64 24 M40 64 L64 40 M56 64 L64 56' stroke='${fg}' opacity='0.15'/>`;
      break;
    case "architect":
      patternSVG = `<rect x='4' y='4' width='24' height='24' fill='none' stroke='${fg}' opacity='0.1'/><rect x='36' y='36' width='24' height='24' fill='none' stroke='${fg}' opacity='0.1'/>`;
      break;
    case "autumn":
      patternSVG = `<path d='M16 8 L24 16 L16 24 L8 16 Z' fill='${fg}' opacity='0.1'/><path d='M48 40 L56 48 L48 56 L40 48 Z' fill='${fg}' opacity='0.1'/>`;
      break;
  }

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>
    <defs>
      <pattern id='hero_${opts.pattern}' patternUnits='userSpaceOnUse' width='${tile}' height='${tile}'>
        <rect width='${tile}' height='${tile}' fill='${bg}'/>
        ${patternSVG}
      </pattern>
    </defs>
    <rect width='100%' height='100%' fill='url(#hero_${opts.pattern})'/>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// GeoPattern integration
// Valid generators: octogons, overlappingCircles, plusSigns, xes, sineWaves, hexagons, overlappingRings, 
// plaid, triangles, squares, nestedSquares, mosaicSquares, concentricCircles, diamonds, tessellation, chevrons
export const GEO_PATTERN_TYPES = [
  "octogons", "overlappingCircles", "plusSigns", "xes", "sineWaves",
  "hexagons", "overlappingRings", "plaid", "triangles", "squares",
  "nestedSquares", "mosaicSquares", "concentricCircles", "diamonds", "tessellation", "chevrons"
] as const;

export type GeoPatternType = typeof GEO_PATTERN_TYPES[number];

export function generateGeoPatternDataUrl(opts: { pattern: GeoPatternType; seed?: string; color?: string; size?: number; }): string {
  const seed = opts.seed ?? `seed-${Math.random()}`;
  const color = opts.color ?? "#000000";
  const size = opts.size ?? 512;

  try {
    const pattern = GeoPattern.generate(seed, {
      generator: opts.pattern,
      color: color,
    });
    
    // GeoPattern.toDataUrl() returns a base64 encoded data URL
    const dataUrl = pattern.toDataUrl();
    
    // If we need to resize, we'll wrap it in a new SVG
    // But GeoPattern already returns proper data URL, so let's just use it directly
    return dataUrl;
  } catch (e) {
    console.error("GeoPattern error:", e);
    // Fallback to simple pattern
    return generatePatternSvgDataUrl({ pattern: "grid", size, bg: "#fff", fg: color });
  }
}
