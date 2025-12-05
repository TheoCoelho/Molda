# Copilot instructions

## Architecture snapshot
- `src/App.tsx` wires React Router routes for onboarding (`pages/Create`), the editor (`pages/Creation`) and downstream flows (`pages/Finalize`, `pages/Profile`).
- `pages/Create.tsx` captures the user's garment selection and drafts; it writes the payload to `localStorage` and routes to `/creation` with `state` so the editor knows which model config to load.
- `pages/Creation.tsx` orchestrates everything else: the left `ExpandableSidebar`, a stack of Fabric-powered 2D canvases (`components/Editor2D.tsx`) and the embedded 3D viewer (`components/Canvas3DViewer.tsx`). Tabs are kept in `canvasTabs`, snapshots in `tabSnapshots`, previews in `tabDecalPreviews`, and decal placements mirror those IDs.
- `components/Canvas3DViewer` delegates to `DecalEngineHost`, which boots `decal-engine/src/usage.ts`. Any change to 3D projection, model loading, mesh prep or gizmos lives in that sibling package (see `src/lib/decal/*` for shared math).
- Model selection is centralized in `src/lib/models.ts`; add new GLTF/USDZ assets there so both Create/Creation stay in sync.

## Fabric editor workflow
- `components/Editor2D` dynamically injects Fabric from a CDN (`loadFabricRuntime`) and installs eraser support via `lib/fabricEraser`. Never `import fabric` directly or Vite chokes.
- History is handled through `lib/HistoryManager`; capture a snapshot whenever you mutate the canvas so `canUndo/canRedo` stay true and `saveDraft` picks up the change.
- All toolbar actions operate through imperative handles stored in `editorRefs`; if you create new controls, call `runWithActiveEditor` or update `selectionInfo` so context menus stay accurate.
- Font flows rely on `FontPicker`, `fonts/library.ts`, and `hooks/use-recent-fonts.ts`. Dispatch `editor2d:fontUsed` when you apply a font so recent lists sync across tabs.

## 3D decal engine
- `DecalEngineHost` mirrors each visible 2D tab into `externalDecals` (PNG data + `DecalTransform`). The Three.js scene lives entirely in `decal-engine/src/usage.ts`, so tweak placement, gizmos, gallery UI, or `OrbitControls` there.
- Surface projection is handled by `src/lib/decal/MeshDecalAdapter` and `SurfaceDecal`; they convert a texture into a clipped mesh. Touch these if you need new filtering/feathering rules rather than hacking the engine directly.
- `getModelConfigFromSelection` maps `part/type/subtype` slugs to `/public/models/*` assets and camera/controls presets. If a garment feels misaligned, adjust that registry first before changing the Three scene.

## Persistence, Supabase, and media
- `Creation.saveDraft` saves the full project to `localStorage` (`currentProject`) and upserts into the Supabase `project_drafts` table with `user_id` + `project_key`. Always call it after tab switches or async mutations that should survive reloads.
- `UploadGallery` depends on `getSupabase()` and the `user-uploads` bucket (`src/lib/supabaseClient.ts`). It signs URLs for private buckets, falls back to local-only mode when env vars or auth are missing, and inserts images by dragging/`onImageInsert`.
- `AuthContext` wraps the app, keeps GoTrue sessions fresh, and auto-inserts a `profiles` row after sign-up using the `SEED_KEY` data. Reuse `useAuth()` instead of hitting `supabase.auth` directly to keep this logic consistent.
- Favorites (`api/fontFavorites.ts`) and recent fonts both degrade to `localStorage` when Supabase or auth is unavailable—be sure to respect those helpers when adding new personalized lists.

## Developer workflows
- Install deps with `npm install` (Bun/Yarn locks are committed for reference but `npm` is used in CI). Run `npm run dev` for Vite, `npm run lint`, and `npm run build` before shipping.
- Fonts: export `GOOGLE_FONTS_API_KEY` and run `npm run generate:fonts` to regenerate `src/fonts/google-library.ts`.
- The embedded engine is a separate Vite project under `decal-engine/`; run `npm install && npm run dev` there if you need to iterate on the Three.js side, but it's imported directly via relative paths so no publish step is needed.
- Required env vars for the frontend live in `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, plus any Supabase Storage settings.

## Patterns & gotchas
- Path alias `@/*` resolves to `src`. Keep shared utilities in `src/lib` and types in `src/types` so both React and Three code paths can import them.
- `DecalEngineHost` only updates `externalDecals` when IDs stay stable—use the tab ID as the decal ID or you'll leak meshes inside the engine.
- `Editor2D` exposes `waitForIdle` and `refresh`; call them before exporting PNGs or persisting JSON to avoid empty snapshots, and throttle expensive `saveDraft` calls by piggybacking on `onHistoryChange` (as Creation already does).
- Upload drag-and-drop sets `text/plain` to the image URL; if you implement new drop targets, read that payload and call the existing `addImage` helper to respect scaling + undo.
- Straight-line gizmo: `Editor2D` now supports only single-segment lines. Segments live inside `__lineMeta` and `applyLineGeometryFromMeta` keeps the Fabric line aligned to those points. The sidebar simply toggles the tool; creation shows a live preview and Shift snaps to 45°. When customizing interactions, reuse `ensureLineControls` and wrap mutations with `runWithLineTransformGuard` to avoid double transforms or noisy history entries.

Have feedback or see missing context? Let me know which sections need more depth and we'll refine this guide.
