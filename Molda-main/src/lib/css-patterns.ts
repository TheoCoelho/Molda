/**
 * CSS Patterns Library - Inspired by UIverse patterns
 * Padrões gerados programaticamente com controles de cor, tamanho e outros parâmetros
 */

export interface CSSPatternParams {
  /** Tamanho base do padrão em pixels */
  size: number;
  /** Cor primária */
  color1: string;
  /** Cor secundária */
  color2: string;
  /** Cor terciária (opcional) */
  color3?: string;
  /** Rotação em graus (opcional) */
  rotation?: number;
  /** Espessura das linhas (para padrões com linhas) */
  lineWidth?: number;
  /** Opacidade geral (0-1) */
  opacity?: number;
}

export interface CSSPatternDefinition {
  id: string;
  name: string;
  category: "waves" | "stripes" | "geometric" | "checker" | "dots" | "gradient" | "3d";
  /** Função que renderiza o padrão em um canvas e retorna a imagem */
  render: (params: CSSPatternParams) => HTMLCanvasElement;
  /** Parâmetros padrão do padrão */
  defaultParams: CSSPatternParams;
  /** Thumbnail pré-gerado como data URL (será gerado automaticamente) */
  thumbnail?: string;
}

// =============================================================================
// PADRÃO 1: Ondas Seigaiha (Japanese Waves) 
// Usa SVG com foreignObject para renderizar CSS diretamente
// =============================================================================

const renderSeigaiha: CSSPatternDefinition["render"] = (params) => {
  const { size, color1, color2, opacity = 1 } = params;
  
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  
  ctx.globalAlpha = opacity;

  // Cria SVG com foreignObject contendo div com CSS original
  const svgContent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="
          width: ${size}px;
          height: ${size}px;
          --s: ${size}px;
          --c1: ${color1};
          --c2: ${color2};
          background: 
            radial-gradient(100% 100% at 100% 0, ${color1} 4%, ${color2} 4% 14%, ${color1} 14% 24%, ${color2} 24% 34%, ${color1} 34% 44%, ${color2} 44% 56%, ${color1} 56% 66%, ${color2} 66% 76%, ${color1} 76% 86%, ${color2} 86% 96%, #0008 96%, #0000),
            radial-gradient(100% 100% at 0 100%, #0000, #0008 4%, ${color2} 4% 14%, ${color1} 14% 24%, ${color2} 24% 34%, ${color1} 34% 44%, ${color2} 44% 56%, ${color1} 56% 66%, ${color2} 66% 76%, ${color1} 76% 86%, ${color2} 86% 96%, ${color1} 96%) ${color1};
          background-size: ${size}px ${size}px;
        "></div>
      </foreignObject>
    </svg>
  `;

  // Converte SVG para data URL
  const svgBlob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  // Cria imagem e desenha no canvas de forma síncrona
  const img = new Image();
  img.src = url;

  // Como precisamos de resultado síncrono, vamos usar a abordagem Canvas direta
  // O CSS radial-gradient(100% 100% at X Y, ...) cria um gradiente elíptico
  // onde 100% 100% é o tamanho da elipse (igual ao container)
  
  // Fundo
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, size, size);

  // Para simular CSS radial-gradient, precisamos desenhar elipses/arcos
  // O truque é que cada "anel" no CSS é uma área entre duas porcentagens
  
  // Gradiente 2 (canto inferior esquerdo) - desenha primeiro (é o fundo)
  drawSeigaihaQuadrant(ctx, 0, size, size, color1, color2, false);
  
  // Gradiente 1 (canto superior direito) - desenha por cima
  drawSeigaihaQuadrant(ctx, size, 0, size, color1, color2, true);

  URL.revokeObjectURL(url);

  return canvas;
};

// Função auxiliar para desenhar um quadrante do padrão seigaiha
function drawSeigaihaQuadrant(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color1: string,
  color2: string,
  isTopRight: boolean
) {
  // Os stops do gradiente CSS traduzidos para porcentagens
  // O raio do gradiente CSS 100% 100% significa que o gradiente vai até a borda mais distante
  // Para um gradiente no canto, isso significa que o raio = size (não diagonal!)
  const maxRadius = size;

  // Define os anéis do padrão
  const rings = isTopRight
    ? [
        // Gradiente 1: centro -> fora
        { r1: 0, r2: 0.04, color: color1 },
        { r1: 0.04, r2: 0.14, color: color2 },
        { r1: 0.14, r2: 0.24, color: color1 },
        { r1: 0.24, r2: 0.34, color: color2 },
        { r1: 0.34, r2: 0.44, color: color1 },
        { r1: 0.44, r2: 0.56, color: color2 },
        { r1: 0.56, r2: 0.66, color: color1 },
        { r1: 0.66, r2: 0.76, color: color2 },
        { r1: 0.76, r2: 0.86, color: color1 },
        { r1: 0.86, r2: 0.96, color: color2 },
        { r1: 0.96, r2: 1.0, color: "rgba(0,0,0,0.53)" },
      ]
    : [
        // Gradiente 2: transparente no centro -> cor na borda
        { r1: 0, r2: 0.04, color: "rgba(0,0,0,0)" },
        { r1: 0.04, r2: 0.14, color: color2 },
        { r1: 0.14, r2: 0.24, color: color1 },
        { r1: 0.24, r2: 0.34, color: color2 },
        { r1: 0.34, r2: 0.44, color: color1 },
        { r1: 0.44, r2: 0.56, color: color2 },
        { r1: 0.56, r2: 0.66, color: color1 },
        { r1: 0.66, r2: 0.76, color: color2 },
        { r1: 0.76, r2: 0.86, color: color1 },
        { r1: 0.86, r2: 0.96, color: color2 },
        { r1: 0.96, r2: 1.0, color: color1 },
      ];

  // Desenha do maior para o menor para que os menores fiquem por cima
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    const outerRadius = ring.r2 * maxRadius;
    
    ctx.fillStyle = ring.color;
    ctx.beginPath();
    ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// =============================================================================
// PADRÃO 2: Cubos Isométricos 3D
// Padrão complexo que cria ilusão de cubos 3D usando gradientes cônicos e lineares
// =============================================================================

const renderIsometricCubes: CSSPatternDefinition["render"] = (params) => {
  const { size, color1, color2, color3, opacity = 1 } = params;
  
  // O padrão original usa --u: 5px como unidade base
  // O tamanho do tile é calc(var(--u) * 16.9) x calc(var(--u) * 12.8)
  const u = size / 16.9; // Calcula a unidade base proporcional ao tamanho desejado
  const tileWidth = u * 16.9;
  const tileHeight = u * 12.8;
  
  const canvas = document.createElement("canvas");
  canvas.width = tileWidth;
  canvas.height = tileHeight;
  const ctx = canvas.getContext("2d")!;
  
  ctx.globalAlpha = opacity;

  // Função auxiliar para criar gradiente cônico
  // Canvas não suporta conic-gradient nativamente, então vamos simular
  const drawConicGradient = (
    cx: number,
    cy: number,
    fromAngle: number,
    stops: Array<{ angle: number; color: string }>
  ) => {
    const centerX = (cx / 100) * tileWidth;
    const centerY = (cy / 100) * tileHeight;
    const maxRadius = Math.max(tileWidth, tileHeight) * 1.5;

    // Desenha segmentos do gradiente cônico
    for (let i = 0; i < stops.length - 1; i++) {
      const currentStop = stops[i];
      const nextStop = stops[i + 1];
      
      if (currentStop.color === "#fff0" || currentStop.color === "transparent") {
        continue;
      }

      const startAngle = ((fromAngle + currentStop.angle) * Math.PI) / 180;
      const endAngle = ((fromAngle + nextStop.angle) * Math.PI) / 180;

      ctx.fillStyle = currentStop.color;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, maxRadius, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();
    }
  };

  // Fundo base: linear-gradient(90deg, color2 0 50%, color3 0 100%)
  ctx.fillStyle = color2 || "#000000";
  ctx.fillRect(0, 0, tileWidth * 0.5, tileHeight);
  ctx.fillStyle = color3 || "#1e1e1e";
  ctx.fillRect(tileWidth * 0.5, 0, tileWidth * 0.5, tileHeight);

  // Camada 10: conic-gradient(from -58deg at 50% 28.125%, color1 0 116deg, transparent 0 100%)
  drawConicGradient(50, 28.125, -58, [
    { angle: 0, color: color1 || "#ededee" },
    { angle: 116, color: color1 || "#ededee" },
    { angle: 116, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 9: conic-gradient(from -58deg at 50.25% 14.85%, color3 0 58deg, color2 0 116deg, transparent 0 100%)
  drawConicGradient(50.25, 14.85, -58, [
    { angle: 0, color: color3 || "#1e1e1e" },
    { angle: 58, color: color3 || "#1e1e1e" },
    { angle: 58, color: color2 || "#000000" },
    { angle: 116, color: color2 || "#000000" },
    { angle: 116, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 8: linear-gradient(-98deg, color2 0 15%, transparent calc(15% + 1px) 100%)
  const grad8 = ctx.createLinearGradient(
    tileWidth,
    0,
    tileWidth - Math.cos((98 * Math.PI) / 180) * tileWidth,
    Math.sin((98 * Math.PI) / 180) * tileHeight
  );
  grad8.addColorStop(0, color2 || "#000000");
  grad8.addColorStop(0.15, color2 || "#000000");
  grad8.addColorStop(0.151, "transparent");
  ctx.fillStyle = grad8;
  ctx.fillRect(0, 0, tileWidth, tileHeight);

  // Camada 7: linear-gradient(98deg, color3 0 15%, transparent calc(15% + 1px) 100%)
  const grad7 = ctx.createLinearGradient(
    0,
    0,
    Math.cos((98 * Math.PI) / 180) * tileWidth,
    Math.sin((98 * Math.PI) / 180) * tileHeight
  );
  grad7.addColorStop(0, color3 || "#1e1e1e");
  grad7.addColorStop(0.15, color3 || "#1e1e1e");
  grad7.addColorStop(0.151, "transparent");
  ctx.fillStyle = grad7;
  ctx.fillRect(0, 0, tileWidth, tileHeight);

  // Camada 6: conic-gradient(from 172deg at 33.13% 50%, color3 0 66deg, color1 0 130deg, transparent 0 100%)
  drawConicGradient(33.13, 50, 172, [
    { angle: 0, color: color3 || "#1e1e1e" },
    { angle: 66, color: color3 || "#1e1e1e" },
    { angle: 66, color: color1 || "#ededee" },
    { angle: 130, color: color1 || "#ededee" },
    { angle: 130, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 5: conic-gradient(from 238deg at 17.15% 50%, color2 0 64deg, transparent 0 100%)
  drawConicGradient(17.15, 50, 238, [
    { angle: 0, color: color2 || "#000000" },
    { angle: 64, color: color2 || "#000000" },
    { angle: 64, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 4: conic-gradient(from 58deg at 66.87% 50%, color1 0 64deg, color2 0 130deg, transparent 0 100%)
  drawConicGradient(66.87, 50, 58, [
    { angle: 0, color: color1 || "#ededee" },
    { angle: 64, color: color1 || "#ededee" },
    { angle: 64, color: color2 || "#000000" },
    { angle: 130, color: color2 || "#000000" },
    { angle: 130, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 3: conic-gradient(from 58deg at 82.85% 50%, color3 0 64deg, transparent 0 100%)
  drawConicGradient(82.85, 50, 58, [
    { angle: 0, color: color3 || "#1e1e1e" },
    { angle: 64, color: color3 || "#1e1e1e" },
    { angle: 64, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 2: conic-gradient(from 122deg at 50% 72.5%, color1 0 116deg, transparent 0 100%)
  drawConicGradient(50, 72.5, 122, [
    { angle: 0, color: color1 || "#ededee" },
    { angle: 116, color: color1 || "#ededee" },
    { angle: 116, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  // Camada 1: conic-gradient(from 122deg at 50% 85.15%, color2 0 58deg, color3 0 116deg, transparent 0 100%)
  drawConicGradient(50, 85.15, 122, [
    { angle: 0, color: color2 || "#000000" },
    { angle: 58, color: color2 || "#000000" },
    { angle: 58, color: color3 || "#1e1e1e" },
    { angle: 116, color: color3 || "#1e1e1e" },
    { angle: 116, color: "#fff0" },
    { angle: 360, color: "#fff0" },
  ]);

  return canvas;
};

// =============================================================================
// BIBLIOTECA DE PADRÕES CSS
// =============================================================================

export const CSS_PATTERN_LIBRARY: CSSPatternDefinition[] = [
  {
    id: "css-seigaiha",
    name: "Ondas Seigaiha",
    category: "waves",
    render: renderSeigaiha,
    defaultParams: {
      size: 100,
      color1: "#f8b195",
      color2: "#355c7d",
    },
  },
  {
    id: "css-isometric-cubes",
    name: "Cubos Isométricos",
    category: "3d",
    render: renderIsometricCubes,
    defaultParams: {
      size: 84.5, // 16.9 * 5 (para manter proporção com --u: 5px)
      color1: "#ededee",
      color2: "#000000",
      color3: "#1e1e1e",
    },
  },
];

// =============================================================================
// FUNÇÕES UTILITÁRIAS
// =============================================================================

export function generatePatternImage(
  pattern: CSSPatternDefinition,
  params?: Partial<CSSPatternParams>
): HTMLCanvasElement {
  const mergedParams = { ...pattern.defaultParams, ...params };
  return pattern.render(mergedParams);
}

export function generatePatternDataUrl(
  pattern: CSSPatternDefinition,
  params?: Partial<CSSPatternParams>
): string {
  const canvas = generatePatternImage(pattern, params);
  return canvas.toDataURL("image/png");
}

export function generateAllThumbnails(): void {
  for (const pattern of CSS_PATTERN_LIBRARY) {
    pattern.thumbnail = generatePatternDataUrl(pattern, { size: 60 });
  }
}

export function getCSSPatternsByCategory(
  category: CSSPatternDefinition["category"]
): CSSPatternDefinition[] {
  return CSS_PATTERN_LIBRARY.filter((p) => p.category === category);
}

export function getCSSPatternById(id: string): CSSPatternDefinition | undefined {
  return CSS_PATTERN_LIBRARY.find((p) => p.id === id);
}

// Labels para as categorias de padrões CSS
export const CSS_PATTERN_CATEGORY_LABELS: Record<CSSPatternDefinition["category"], string> = {
  waves: "Ondas",
  stripes: "Listras",
  geometric: "Geométrico",
  checker: "Xadrez",
  dots: "Pontos",
  gradient: "Gradiente",
  "3d": "3D",
};
