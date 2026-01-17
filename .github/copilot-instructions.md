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
