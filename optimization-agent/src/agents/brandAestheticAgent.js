#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora from 'ora';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '../..');
const configPath = path.join(rootDir, 'config.json');

const defaultBrief = {
  companyName: 'Molda',
  sector: 'fashion',
  audience: 'jovens adultos urbanos',
  styleKeywords: ['moderno', 'vibrante', 'inovador','futurista'],
  personality: ['confiante', 'criativa', 'acessível'],
  interactiveLevel: 'medium',
  deliverables: ['logo', 'typography', 'colors', 'patterns', 'tokens']
};

const sectorHueMap = {
  fashion: 276,
  tech: 221,
  beauty: 326,
  sports: 12,
  food: 34,
  education: 208,
  default: 256
};

const typographyByMood = {
  minimalista: {
    heading: 'Inter',
    body: 'Manrope',
    accent: 'Space Grotesk'
  },
  premium: {
    heading: 'Playfair Display',
    body: 'Inter',
    accent: 'Cormorant Garamond'
  },
  moderno: {
    heading: 'Sora',
    body: 'Inter',
    accent: 'Plus Jakarta Sans'
  },
  ousado: {
    heading: 'Archivo Black',
    body: 'Inter',
    accent: 'Bebas Neue'
  }
};

function parseArgs(argv) {
  const args = { brief: null, out: null };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--brief') {
      args.brief = argv[index + 1];
      index += 1;
      continue;
    }
    if (item === '--out') {
      args.out = argv[index + 1];
      index += 1;
      continue;
    }
    positional.push(item);
  }
  if (!args.brief && positional.length > 0) args.brief = positional[0];
  return args;
}

function hslToHex(hue, saturation, lightness) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (hue >= 0 && hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function sanitizeName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim();
}

function getInitials(companyName) {
  const parts = sanitizeName(companyName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'NM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function pickTypography(styleKeywords = []) {
  for (const keyword of styleKeywords) {
    const normalized = keyword.toLowerCase();
    if (typographyByMood[normalized]) return typographyByMood[normalized];
  }
  return typographyByMood.moderno;
}

function buildPalette(sector, styleKeywords = []) {
  const baseHue = sectorHueMap[sector?.toLowerCase()] ?? sectorHueMap.default;
  const highContrast = styleKeywords.some((value) => ['ousado', 'vibrante', 'energetico', 'energético'].includes(value.toLowerCase()));

  return {
    primary: hslToHex(baseHue, highContrast ? 84 : 72, 52),
    secondary: hslToHex((baseHue + 38) % 360, 66, 46),
    accent: hslToHex((baseHue + 180) % 360, 78, highContrast ? 56 : 48),
    background: hslToHex(baseHue, 30, 98),
    surface: hslToHex(baseHue, 20, 95),
    textPrimary: hslToHex(baseHue, 24, 16),
    textMuted: hslToHex(baseHue, 14, 36),
    border: hslToHex(baseHue, 16, 84)
  };
}

function buildArchetype(styleKeywords = [], personality = []) {
  const corpus = [...styleKeywords, ...personality].map((value) => value.toLowerCase());
  if (corpus.some((value) => ['premium', 'sofisticado', 'elegante'].includes(value))) return 'Creator-Luxury';
  if (corpus.some((value) => ['ousado', 'disruptivo', 'inovador'].includes(value))) return 'Magician-Innovator';
  if (corpus.some((value) => ['amigavel', 'amigável', 'acessivel', 'acessível'].includes(value))) return 'Everyman-Friendly';
  return 'Creator-Modern';
}

function buildLogoSvgs(companyName, initials, palette, typography) {
  const safeName = sanitizeName(companyName) || 'Nova Marca';
  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="320" viewBox="0 0 1200 320" fill="none"><rect width="1200" height="320" rx="30" fill="${palette.background}"/><rect x="60" y="56" width="208" height="208" rx="48" fill="${palette.primary}"/><path d="M120 208V112h34l44 56 44-56h34v96h-31v-47l-38 48h-18l-38-48v47h-31z" fill="white"/><text x="320" y="190" fill="${palette.textPrimary}" font-family="${typography.heading}, sans-serif" font-size="92" font-weight="700" letter-spacing="-1.5">${safeName}</text></svg>`;

  const monogram = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none"><defs><linearGradient id="g" x1="70" y1="80" x2="440" y2="420" gradientUnits="userSpaceOnUse"><stop stop-color="${palette.primary}"/><stop offset="1" stop-color="${palette.accent}"/></linearGradient></defs><rect width="512" height="512" rx="120" fill="${palette.background}"/><circle cx="256" cy="256" r="168" fill="url(#g)"/><text x="256" y="294" text-anchor="middle" fill="white" font-family="${typography.heading}, sans-serif" font-size="148" font-weight="700">${initials}</text></svg>`;

  const emblem = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="720" viewBox="0 0 720 720" fill="none"><rect width="720" height="720" rx="120" fill="${palette.background}"/><path d="M360 80l190 110v220L360 520 170 410V190L360 80z" fill="${palette.surface}" stroke="${palette.border}" stroke-width="10"/><path d="M250 380V236h50l60 72 60-72h50v144h-42v-78l-55 67h-26l-55-67v78h-42z" fill="${palette.secondary}"/></svg>`;

  return { wordmark, monogram, emblem };
}

function buildInteractiveCss(tokens) {
  return `:root {
  --brand-primary: ${tokens.colors.primary};
  --brand-secondary: ${tokens.colors.secondary};
  --brand-accent: ${tokens.colors.accent};
  --brand-bg: ${tokens.colors.background};
  --brand-surface: ${tokens.colors.surface};
  --brand-text: ${tokens.colors.textPrimary};
}

.brand-pattern-grid {
  background-color: var(--brand-bg);
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--brand-primary) 18%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--brand-primary) 18%, transparent) 1px, transparent 1px);
  background-size: 24px 24px;
  transition: background-size 280ms ease;
}

.brand-pattern-grid:hover {
  background-size: 18px 18px;
}

.brand-pattern-aurora {
  background: radial-gradient(circle at 18% 22%, color-mix(in srgb, var(--brand-accent) 34%, transparent), transparent 45%),
              radial-gradient(circle at 82% 26%, color-mix(in srgb, var(--brand-secondary) 30%, transparent), transparent 42%),
              radial-gradient(circle at 48% 84%, color-mix(in srgb, var(--brand-primary) 28%, transparent), transparent 46%),
              var(--brand-bg);
  animation: brandFloat 8s ease-in-out infinite alternate;
}

@keyframes brandFloat {
  from { filter: hue-rotate(0deg) saturate(1); }
  to { filter: hue-rotate(16deg) saturate(1.06); }
}
`;
}

function buildTokens(brief, palette, typography, archetype) {
  return {
    meta: {
      companyName: brief.companyName,
      sector: brief.sector,
      generatedAt: new Date().toISOString(),
      archetype
    },
    colors: palette,
    typography,
    radius: {
      sm: '8px',
      md: '12px',
      lg: '20px',
      pill: '999px'
    },
    shadow: {
      soft: '0 8px 24px -14px color-mix(in srgb, var(--brand-primary) 35%, transparent)',
      strong: '0 20px 45px -20px color-mix(in srgb, var(--brand-secondary) 35%, transparent)'
    }
  };
}

function buildGuide(brief, tokens) {
  return `# Brand System — ${brief.companyName}

## Resumo Estratégico
- Setor: ${brief.sector}
- Público: ${brief.audience}
- Personalidade: ${(brief.personality || []).join(', ') || 'não definida'}
- Palavras-chave de estilo: ${(brief.styleKeywords || []).join(', ') || 'não definidas'}
- Arquétipo sugerido: ${tokens.meta.archetype}

## Tipografia
- Heading: ${tokens.typography.heading}
- Body: ${tokens.typography.body}
- Accent: ${tokens.typography.accent}

## Cores
- Primary: ${tokens.colors.primary}
- Secondary: ${tokens.colors.secondary}
- Accent: ${tokens.colors.accent}
- Background: ${tokens.colors.background}
- Surface: ${tokens.colors.surface}
- Text Primary: ${tokens.colors.textPrimary}

## Entregáveis Gerados
1. ` + '`logos/`' + ` (3 variações SVG)
2. ` + '`patterns/interactive-patterns.css`' + ` (padrões interativos)
3. ` + '`brand-system.json`' + ` (tokens centralizados)
4. ` + '`tokens.css`' + ` (variáveis CSS)
5. ` + '`tailwind.brand.extend.cjs`' + ` (extensão de tema)

## Próximos Passos
1. Revisar ` + '`brand-system.json`' + ` e ajustar o brief se necessário
2. Aplicar ` + '`tokens.css`' + ` no app principal
3. Importar ` + '`patterns/interactive-patterns.css`' + ` nos layouts de landing
4. Usar logo wordmark em header e monograma como ícone
`;
}

function buildTailwindExtension(tokens) {
  return `module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '${tokens.colors.primary}',
          secondary: '${tokens.colors.secondary}',
          accent: '${tokens.colors.accent}',
          bg: '${tokens.colors.background}',
          surface: '${tokens.colors.surface}',
          text: '${tokens.colors.textPrimary}',
          muted: '${tokens.colors.textMuted}',
          border: '${tokens.colors.border}'
        }
      },
      fontFamily: {
        brandHeading: ['${tokens.typography.heading}', 'sans-serif'],
        brandBody: ['${tokens.typography.body}', 'sans-serif'],
        brandAccent: ['${tokens.typography.accent}', 'sans-serif']
      },
      borderRadius: {
        brandSm: '${tokens.radius.sm}',
        brandMd: '${tokens.radius.md}',
        brandLg: '${tokens.radius.lg}'
      }
    }
  }
};
`;
}

async function loadBrief(briefPath) {
  if (!briefPath) return defaultBrief;
  const absolutePath = path.isAbsolute(briefPath) ? briefPath : path.join(rootDir, briefPath);
  const exists = await fs.pathExists(absolutePath);
  if (!exists) throw new Error(`Brief não encontrado: ${absolutePath}`);
  const loaded = await fs.readJson(absolutePath);
  return { ...defaultBrief, ...loaded };
}

async function run() {
  const spinner = ora('Inicializando Brand Aesthetic Agent...').start();
  try {
    const args = parseArgs(process.argv.slice(2));
    const config = await fs.readJson(configPath);
    const brief = await loadBrief(args.brief);

    if (!brief.companyName || !String(brief.companyName).trim()) {
      throw new Error('O campo companyName é obrigatório no brief.');
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const outputRoot = args.out
      ? (path.isAbsolute(args.out) ? args.out : path.join(rootDir, args.out))
      : path.join(rootDir, config?.brandAgent?.reportsPath || 'reports/brand-agent', timestamp);

    const logosDir = path.join(outputRoot, 'logos');
    const patternsDir = path.join(outputRoot, 'patterns');
    await fs.ensureDir(logosDir);
    await fs.ensureDir(patternsDir);

    spinner.text = 'Gerando sistema visual...';
    const archetype = buildArchetype(brief.styleKeywords, brief.personality);
    const palette = buildPalette(brief.sector, brief.styleKeywords);
    const typography = pickTypography(brief.styleKeywords);
    const tokens = buildTokens(brief, palette, typography, archetype);
    const initials = getInitials(brief.companyName);
    const logos = buildLogoSvgs(brief.companyName, initials, palette, typography);

    const tokensCss = buildInteractiveCss(tokens);
    const brandGuide = buildGuide(brief, tokens);
    const tailwindExtension = buildTailwindExtension(tokens);

    spinner.text = 'Salvando artefatos...';
    await fs.writeJson(path.join(outputRoot, 'brand-system.json'), tokens, { spaces: 2 });
    await fs.writeFile(path.join(outputRoot, 'tokens.css'), tokensCss, 'utf8');
    await fs.writeFile(path.join(outputRoot, 'tailwind.brand.extend.cjs'), tailwindExtension, 'utf8');
    await fs.writeFile(path.join(outputRoot, 'BRAND_GUIDE.md'), brandGuide, 'utf8');
    await fs.writeFile(path.join(logosDir, 'logo-wordmark.svg'), logos.wordmark, 'utf8');
    await fs.writeFile(path.join(logosDir, 'logo-monogram.svg'), logos.monogram, 'utf8');
    await fs.writeFile(path.join(logosDir, 'logo-emblem.svg'), logos.emblem, 'utf8');
    await fs.writeFile(path.join(patternsDir, 'interactive-patterns.css'), tokensCss, 'utf8');

    spinner.succeed('Brand Aesthetic Agent concluído com sucesso');

    console.log(chalk.bold.cyan('\n🎨 BRAND PACK GERADO\n'));
    console.log(chalk.green(`Empresa: ${brief.companyName}`));
    console.log(chalk.green(`Setor: ${brief.sector}`));
    console.log(chalk.green(`Arquétipo: ${archetype}`));
    console.log(chalk.cyan(`Saída: ${outputRoot}\n`));
    console.log('Arquivos principais:');
    console.log(`  • ${path.join(outputRoot, 'brand-system.json')}`);
    console.log(`  • ${path.join(outputRoot, 'BRAND_GUIDE.md')}`);
    console.log(`  • ${path.join(outputRoot, 'logos')}`);
    console.log(`  • ${path.join(outputRoot, 'patterns', 'interactive-patterns.css')}\n`);
  } catch (error) {
    spinner.fail('Falha ao executar Brand Aesthetic Agent');
    console.error(chalk.red(error.message));
    process.exit(1);
  }
}

run();
