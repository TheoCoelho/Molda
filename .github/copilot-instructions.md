# Copilot instructions (Molda-13)

## Repo shape (two Vite apps)
- `Molda-main/` is the main React + TS + Tailwind/shadcn UI app (Vite). Start here for product changes.
- `decal-engine/` is a standalone Three.js decal engine (Vite) that the main app embeds via a direct TS import.
- A deeper app-specific guide already exists at `Molda-main/.github/copilot-instructions.md` (keep it in sync when making bigger architectural changes).

## Critical data flow (2D editor → 3D decals)
- The editor page is `Molda-main/src/pages/Creation.tsx`: it manages canvas tabs, snapshots, and `tabDecalPreviews` (PNG data URLs) plus `tabDecalPlacements` (3D transforms).
- 3D embedding happens in `Molda-main/src/components/DecalEngineHost.tsx`, which imports `decal-engine/src/usage.ts` directly and pushes `ExternalDecalData[]` into the engine via `upsertExternalDecal`.
- **Keep decal IDs stable**: the engine diffing/removal logic assumes IDs persist (tab id == decal id is the common pattern).

## 3D engine conventions
- `decal-engine/src/usage.ts` is the entrypoint: it reads URL params like `model` and `hideMenu` and builds the Three scene + gizmos.
- When embedded, `DecalEngineHost` sets `model`/`hideMenu` via `window.history.replaceState`; don’t remove this unless you also change how `usage.ts` selects models.
- Model selection for the embedded experience is centralized in `Molda-main/src/lib/models.ts` (`getModelConfigFromSelection`).
  - If you add a new garment: add the asset under `Molda-main/public/models/` and register it in `models.ts`.
  - If you need standalone engine support too, mirror the asset under `decal-engine/public/models/`.

## 2D editor (Fabric) gotchas
- `Molda-main/src/components/Editor2D.tsx` **loads Fabric at runtime from CDN** (`loadFabricRuntime`). Avoid `import fabric` in app code.
- Undo/redo is mediated by `Molda-main/src/lib/HistoryManager.ts`; mutations should capture history so `Creation` can persist/preview correctly.
- Some tools store custom metadata on Fabric objects (e.g. `__lineMeta`, `__curveMeta`); if you change transforms for groups/selections, keep those metas in sync.

## Supabase integration expectations
- Core flows expect Supabase env vars: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (place in `Molda-main/.env` or `.env.local`).
- `Molda-main/src/integrations/supabase/client.ts` throws on missing env vars; for optional features prefer `getSupabase()` from `Molda-main/src/lib/supabaseClient.ts` (returns `null` when unconfigured).

## Developer workflows (Windows-friendly)
- Main app: `cd Molda-main; npm install; npm run dev` (Vite serves on port `8080`, see `Molda-main/vite.config.ts`).
- Decal engine standalone: `cd decal-engine; npm install; npm run dev`.
- Fonts: `cd Molda-main; npm run generate:fonts` (requires `GOOGLE_FONTS_API_KEY`).

---

# Crescimento Orgânico e Branding (Pesquisa de Algoritmo e Engajamento)

## Algoritmo TikTok (For You Page) — Dados Oficiais
- **Follower count NÃO é fator direto** de distribuição. Contas novas podem viralizar se tiverem alta retenção.
- Sinais em ordem de peso:
  1. Taxa de conclusão do vídeo / replay — **muito alto**
  2. Compartilhamentos — **alto**
  3. Comentários e likes — **alto**
  4. Informações do vídeo (legenda, hashtag, som) — **médio**
  5. Idioma e país — **baixo**
- O algoritmo testa vídeo em grupos pequenos e expande progressivamente se a retenção for alta.

## Algoritmo Instagram — Reels e Explorar (Dados Oficiais)
- Para **Reels com distribuição a não-seguidores**, sinais mais pesados (ordem de importância):
  1. Salvos/compartilhamentos — **altíssimo**
  2. Watch-through até o fim — **altíssimo**
  3. Velocidade de engajamento nas 1ª horas (popularidade crescente) — **alto**
  4. Conteúdo original (sem TikTok watermark, bordas pretas, ou texto excessivo) — **alto**
  5. Informações do criador (atividade recente) — **médio**
- **Insight crítico:** Instagram oficialmente afirma que NÃO suprime conteúdo para vender anúncios. Conteúdo engajante recebe distribuição gratuita.
- Save é o sinal mais forte para conteúdo educativo + revelador de processo.

## Princípios de Engajamento Empíricos

### Retenção (faz o vídeo ser distribuído)
- **Gancho nos 0–2s**: afirmação polarizadora, pergunta curiosa ou dado surpreendente
- **Loop aberto**: não resolver tudo no início — manter tensão até o final
- **Movimentação**: cortes a cada 3–5 segundos para manter atenção visual

### Compartilhamento (multiplica alcance organicamente)
- Conteúdo que a pessoa **quer mandar para alguém específico** (amigo, colega, cliente)
- Conteúdo que **valida crença que a pessoa já tem** mas nunca viu articulada

### Comentários (loop de distribuição)
- Terminar com **pergunta que divide opiniões**, não pergunta genérica
- Melhor: "Você pagaria R$X por isso ou acha caro?" > "O que vocês acham?"

### Saves (Instagram — sinal mais forte)
- Conteúdo educativo + revelador de process internos
- "Como eu descobri que X funciona" > "Dicas genéricas de X"

## Padrão de Criadores de Referência (Nichos Adjacentes)
- Custom apparel (@viralcuts.co, @heatpressgang): ASMR de execução física, processo visível
- POD SaaS (@printify, @printful): Tutoriais + histórias reais de clientes que faturaram
- Build-in-public (@zonteevu, founders YC): Transparência total — faturamento, erros, bastidores
- **Padrão comum:** Mostrar o que os outros escondem. A audiência acompanha a **pessoa tomando decisão em tempo real**, não o produto.

## Diferencial Competitivo da Molda para Conteúdo
- **"1 peça, sem mínimo, com visualização 3D antes de comprar"**
- Editor 2D integrado + visualização 3D no mesmo fluxo
- Foco em pequeno criador / pessoa física — não fabricante industrial
- Quebra o padrão "mínimo 200 peças" que destrói small creators

## Série de Conteúdo Inicial — Molda (5 primeiros vídeos)

| # | Título | Objetivo | Pilar de Estratégia |
|---|---|---|---|
| 1 | "Comecei a construir uma empresa. Esse é o dia 1." | Apresentação + abertura de narrativa contínua | Construção pública + Visão de futuro |
| 2 | "O erro que quase acabou com o projeto antes de começar" | Vulnerabilidade emocional — humanização | Construção pública + Aprendizado |
| 3 | "Mostrei o protótipo para 5 pessoas. As reações foram..." | Validação pública + CTA votação/comentário | Validação e interação |
| 4 | "Por que mínimo de 200 peças destrói o pequeno criador no Brasil" | Alto compartilhamento — problema de mercado | Problema de mercado |
| 5 | "Primeira pessoa que testou o editor ao vivo" | Prova social + demonstração de produto | Autoridade + Raciocínio de negócio |

## Checklist de Postagem
- [ ] Gancho polarizador nos primeiros 2 segundos (não começa com "oi, sou...")
- [ ] Texto na tela em momentos-chave (legibilidade sem som)
- [ ] Áudio com qualidade mínima OK (lapela, ambiente silencioso, sem ruído)
- [ ] Termina com pergunta que divide opiniões (jamais "o que vocês acham?")
- [ ] Legenda: 3–5 hashtags de nicho + 1–2 hashtags de volume alto
- [ ] No Instagram: postar Reel nativamente (sem marca d'água TikTok)
- [ ] Horário de pico: 18h–21h ou 12h–13h (Brasília)
- [ ] CTA clara (comentário, save, compartilhamento, voto)

## 5 Pilares Obrigatórios de Conteúdo — Sempre Alinhar
1. **Construção pública** — mostrar processo real, decisões, evolução
2. **Problema de mercado** — validar que o problema existe e é grave
3. **Visão de futuro** — onde isso pode escalar no Brasil
4. **Validação e interação** — envolver audiência em decisões
5. **Autoridade e raciocínio de negócio** — mostrar lógica por trás das decisões
