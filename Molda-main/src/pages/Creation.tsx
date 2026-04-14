import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import Header from "../components/Header";
import Canvas3DViewer from "../components/Canvas3DViewer";
import ExpandableSidebar from "../components/ExpandableSidebar";
import { Button } from "../components/ui/button";
import { Plus, X, Check } from "lucide-react";
import FloatingEditorToolbar from "../components/FloatingEditorToolbar";
import TextToolbar from "../components/TextToolbar";
import ImageToolbar from "../components/ImageToolbar";
import { useRecentFonts } from "../hooks/use-recent-fonts";
import { EyeTabDivider } from "../components/ui/EyeTabDivider";

import Editor2D, {
  Editor2DHandle,
  Tool,
  BrushVariant,
  ShapeKind,
  SelectionInfo,
} from "../components/Editor2D";
import { supabase } from "../integrations/supabase/client";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../components/ui/context-menu";
import { PatternSubmenu } from "../components/PatternSubmenuEnhanced";
import type { PatternDefinition } from "../lib/patterns";
import { useAuth } from "../contexts/AuthContext";
import type { ExternalDecalData, DecalTransform, DecalStateSnapshot } from "../types/decals";
import { STORAGE_BUCKET } from "../lib/supabaseClient";
import { toast } from "sonner";
import { normalizeDbDecalZones, type ModelDecalZone } from "../lib/models";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };
type SelectionKind = "none" | "text" | "image" | "other";
type DraftPayload = {
  projectName: string;
  baseColor: string;
  size: string;
  fabric: string;
  notes: string;
  part: string | null;
  type: string | null;
  subtype: string | null;
  canvasSnapshots: Record<string, string>;
  canvasTabs: CanvasTab[];
  tabVisibility: Record<string, boolean>;
  tabDecalPreviews: Record<string, string>;
  tabDecalPlacements: Record<string, DecalTransform>;
  tabPrintTypes?: Record<string, string>;
  activeCanvasTab: string;
  savedAt: string;
  draftKey: string;
  draftId?: string;
  projectKey: string;
  isPermanent?: boolean;
  ephemeralExpiresAt?: string | null;
};

type SaveDraftOptions = {
  immediateRemote?: boolean;
  tabId?: string;
  markPermanent?: boolean;
};

type SubtypePrintConstraints = {
  id: string;
  print_area_width_cm?: number | null;
  print_area_height_cm?: number | null;
  min_decal_area_cm2?: number | null;
  neck_zone_y_min?: number | null;
  underarm_zone_y_min?: number | null;
  underarm_zone_y_max?: number | null;
  underarm_zone_abs_x_min?: number | null;
  decal_zones_json?: unknown;
};

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9p7i/ZkAAAAASUVORK5CYII=";

const EPSILON = 1e-4;
const nearlyEqual = (a?: number | null, b?: number | null) => {
  if (typeof a !== "number" && typeof b !== "number") return true;
  if (typeof a !== "number" || typeof b !== "number") return false;
  return Math.abs(a - b) <= EPSILON;
};

const DRAFT_EPHEMERAL_TTL_MS = 5 * 60 * 1000;

const VIABILITY_WARNING_LABELS: Record<string, string> = {
  min_area_violation: "Decal abaixo da area minima recomendada para a peca.",
  neck_zone_risk: "Decal proximo da gola (area de risco de producao).",
  underarm_zone_risk: "Decal abaixo da manga/lateral (area de risco de producao).",
  relief_overlap_risk: "Decal em regiao de relevo alto/sobreposicao.",
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const tsPrefix = () => new Date().toISOString().replace(/[-:.TZ]/g, "");

const vectorNearlyEqual = (a?: DecalTransform["position"], b?: DecalTransform["position"]) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return nearlyEqual(a.x, b.x) && nearlyEqual(a.y, b.y) && nearlyEqual(a.z, b.z);
};

const transformNearlyEqual = (a?: DecalTransform | null, b?: DecalTransform | null) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    vectorNearlyEqual(a.position, b.position) &&
    vectorNearlyEqual(a.normal, b.normal) &&
    nearlyEqual(a.width, b.width) &&
    nearlyEqual(a.height, b.height) &&
    nearlyEqual(a.depth, b.depth) &&
    nearlyEqual(a.angle, b.angle)
  );
};

const decalMapEquals = (a: Record<string, DecalTransform>, b: Record<string, DecalTransform>) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!transformNearlyEqual(a[key], b[key])) return false;
  }
  return true;
};

const Creation = () => {
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>("Inter");
  const location = useLocation();
  const navigationState = (location.state ?? {}) as {
    startFresh?: boolean;
    restoreDraft?: boolean;
    draftId?: string;
    draftKey?: string;
    projectKey?: string;
    activeCanvasTab?: string;
  };
  const { user } = useAuth();
  const skipInitialLoadRef = useRef<boolean>(Boolean(navigationState.startFresh));
  const draftKeyRef = useRef<string | null>(navigationState.draftKey ?? navigationState.projectKey ?? null);
  const draftIdRef = useRef<string | null>(navigationState.draftId ?? null);
  const [draftId, setDraftId] = useState<string | null>(navigationState.draftId ?? null);
  const initialDraftSavedRef = useRef(false);
  const isDraftPermanentRef = useRef<boolean>(false);
  const [isDraftPermanent, setIsDraftPermanent] = useState<boolean>(false);

  // Hook para gerenciar fontes recentes por projeto
  const { resetProject, addRecentFont } = useRecentFonts();
  const addRecentFontRef = useRef(addRecentFont);

  useEffect(() => {
    addRecentFontRef.current = addRecentFont;
  }, [addRecentFont]);

  const [isTrashMode, setTrashModeRaw] = useState(false);
  const setTrashMode = (v: boolean) => {
    setTrashModeRaw(v);
    if (v) setTool("select");
  };

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const part = searchParams.get("part");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");

  const [projectName, setProjectName] = useState("");
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [size, setSize] = useState("M");
  const [fabric, setFabric] = useState("Algodão");
  const [fixedSubtypeFabric, setFixedSubtypeFabric] = useState<string | null>(null);
  const [isSubtypeFabricLocked, setIsSubtypeFabricLocked] = useState(false);
  const [subtypePrintConstraints, setSubtypePrintConstraints] = useState<SubtypePrintConstraints | null>(null);
  const [subtypeDecalZonesOverride, setSubtypeDecalZonesOverride] = useState<ModelDecalZone[]>([]);
  const [decalViabilityAlerts, setDecalViabilityAlerts] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");

  const [canvasTabs, setCanvasTabs] = useState<CanvasTab[]>([
    { id: "3d", name: subtype || "3D", type: "3d" },
  ]);
  const [activeCanvasTab, setActiveCanvasTab] = useState("3d");
  const [tabTransitionDirection, setTabTransitionDirection] = useState<"left" | "right">("right");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isToolbarTransitioning, setIsToolbarTransitioning] = useState(false);
  const [toolbarTransitionType, setToolbarTransitionType] = useState<"in" | "out">("in");
  const canvasTabsRef = useRef<CanvasTab[]>(canvasTabs);
  useEffect(() => {
    canvasTabsRef.current = canvasTabs;
  }, [canvasTabs]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const resolveSubtypeFabric = async () => {
      setFixedSubtypeFabric(null);
      setIsSubtypeFabricLocked(false);
      setSubtypePrintConstraints(null);
      setSubtypeDecalZonesOverride([]);

      if (!subtype) return;

      try {
        let typeId: string | null = null;
        if (type) {
          const { data: typeRow } = await supabase
            .from("product_types")
            .select("id")
            .ilike("name", type)
            .maybeSingle();
          typeId = typeRow?.id ?? null;
        }

        let subtypeQuery = supabase
          .from("product_subtypes")
          .select("id, print_area_width_cm, print_area_height_cm, min_decal_area_cm2, neck_zone_y_min, underarm_zone_y_min, underarm_zone_y_max, underarm_zone_abs_x_min, decal_zones_json")
          .ilike("name", subtype)
          .limit(1);

        if (typeId) {
          subtypeQuery = supabase
            .from("product_subtypes")
            .select("id, print_area_width_cm, print_area_height_cm, min_decal_area_cm2, neck_zone_y_min, underarm_zone_y_min, underarm_zone_y_max, underarm_zone_abs_x_min, decal_zones_json")
            .eq("type_id", typeId)
            .ilike("name", subtype)
            .limit(1);
        }

        const { data: subtypeRows, error: subtypeErr } = await subtypeQuery;
        if (subtypeErr) throw subtypeErr;

        const subtypeId = subtypeRows?.[0]?.id;
        if (!subtypeId) return;

        const subtypeMeta = subtypeRows?.[0] as SubtypePrintConstraints | undefined;
        if (subtypeMeta) {
          setSubtypePrintConstraints({
            id: subtypeMeta.id,
            print_area_width_cm: subtypeMeta.print_area_width_cm ?? null,
            print_area_height_cm: subtypeMeta.print_area_height_cm ?? null,
            min_decal_area_cm2: subtypeMeta.min_decal_area_cm2 ?? 5,
            neck_zone_y_min: subtypeMeta.neck_zone_y_min ?? 0.82,
            underarm_zone_y_min: subtypeMeta.underarm_zone_y_min ?? 0.45,
            underarm_zone_y_max: subtypeMeta.underarm_zone_y_max ?? 0.72,
            underarm_zone_abs_x_min: subtypeMeta.underarm_zone_abs_x_min ?? 0.55,
            decal_zones_json: subtypeMeta.decal_zones_json,
          });
          setSubtypeDecalZonesOverride(normalizeDbDecalZones(subtypeMeta.decal_zones_json));
        }

        const { data: relRows, error: relErr } = await supabase
          .from("subtype_materials")
          .select("material_id")
          .eq("subtype_id", subtypeId)
          .limit(1);
        if (relErr) throw relErr;

        const materialId = relRows?.[0]?.material_id;
        if (!materialId) return;

        const { data: materialRow, error: materialErr } = await supabase
          .from("materials")
          .select("name")
          .eq("id", materialId)
          .maybeSingle();
        if (materialErr) throw materialErr;

        if (cancelled) return;
        const resolvedFabric = materialRow?.name ?? null;
        if (!resolvedFabric) return;

        setFixedSubtypeFabric(resolvedFabric);
        setFabric(resolvedFabric);
        setIsSubtypeFabricLocked(true);
      } catch (err) {
        console.warn("[creation.resolveSubtypeFabric]", err);
      }
    };

    void resolveSubtypeFabric();
    return () => {
      cancelled = true;
    };
  }, [subtype, type]);

  const [tool, setTool] = useState<Tool>("select");
  const [brushVariant, setBrushVariant] = useState<BrushVariant>("pencil");
  const [continuousLineMode, setContinuousLineMode] = useState(false);
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [stampDensity, setStampDensity] = useState(50);
  const [stampColor, setStampColor] = useState("#000000");
  const [stampImageSrc, setStampImageSrc] = useState<string | null>(null);

  const [stampSrc, setStampSrc] = useState<string | null>(null);

  // Applies a solid tint where the stamp pixels are present.
  // Uses the image's luminance to preserve texture/softness.
  useEffect(() => {
    let cancelled = false;
    const src = stampImageSrc;
    if (!src) {
      setStampSrc(null);
      return;
    }

    const hex = stampColor;
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    const tint = m ? parseInt(m[1], 16) : 0;
    const tr = (tint >> 16) & 255;
    const tg = (tint >> 8) & 255;
    const tb = tint & 255;

    const run = async () => {
      try {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        await img.decode();
        if (cancelled) return;

        const w = Math.max(1, img.naturalWidth || img.width || 1);
        const h = Math.max(1, img.naturalHeight || img.height || 1);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setStampSrc(src);
          return;
        }

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imageData = ctx.getImageData(0, 0, w, h);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a === 0) continue;

          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          // Keep alpha and use luminance to modulate it (preserve texture)
          const outA = Math.round((a * lum));
          if (outA === 0) {
            data[i + 3] = 0;
            continue;
          }
          data[i] = tr;
          data[i + 1] = tg;
          data[i + 2] = tb;
          data[i + 3] = outA;
        }
        ctx.putImageData(imageData, 0, 0);

        const out = canvas.toDataURL("image/png");
        if (!cancelled) setStampSrc(out);
      } catch {
        if (!cancelled) setStampSrc(src);
      }
    };

    // Immediately fall back to raw image while tinting computes.
    setStampSrc(src);
    void run();

    return () => {
      cancelled = true;
    };
  }, [stampImageSrc, stampColor]);

  const editorRefs = useRef<Record<string, Editor2DHandle | null>>({});
  const twoDViewportRef = useRef<HTMLDivElement | null>(null);
  const squareCanvasRef = useRef<HTMLDivElement | null>(null);
  const [twoDViewportSize, setTwoDViewportSize] = useState<{ width: number; height: number } | null>(null);
  const lastEditorTabRef = useRef<string | null>(null);
  // Mantém refs estáveis para evitar loops com callback ref inline
  const prevTabRef = useRef<string>(activeCanvasTab);
  const prevSavedTabRef = useRef<string>(activeCanvasTab);

  useEffect(() => {
    const el = twoDViewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setTwoDViewportSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const squareViewportSize = useMemo(() => {
    if (!twoDViewportSize) return null;
    return Math.max(1, Math.floor(Math.max(twoDViewportSize.width, twoDViewportSize.height)));
  }, [twoDViewportSize]);

  // Efeito para detectar mudança de tab e disparar transição
  useEffect(() => {
    const prevTab = prevTabRef.current;
    if (prevTab !== activeCanvasTab) {
      // Determina a direção da transição baseado na posição das tabs
      const prevIndex = canvasTabs.findIndex((t) => t.id === prevTab);
      const currentIndex = canvasTabs.findIndex((t) => t.id === activeCanvasTab);

      setTabTransitionDirection(currentIndex > prevIndex ? "right" : "left");
      setIsTransitioning(true);

      // Remove o estado de transição após a animação
      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 400);

      prevTabRef.current = activeCanvasTab;
      return () => clearTimeout(timer);
    }
  }, [activeCanvasTab, canvasTabs]);

  // Salva a tab anterior sempre que a tab ativa muda
  const prevEditorInstRef = useRef<Editor2DHandle | null>(null);
  const selectionListenerGuard = useRef<WeakSet<Editor2DHandle>>(new WeakSet());

  // Callback de ref estável (não depende do branch do JSX)
  const editorRefCallback = useCallback(
    (inst: Editor2DHandle | null) => {
      const currentTabId = activeCanvasTab;
      if (inst === prevEditorInstRef.current) return;

      // Removido: salvamento da tab anterior aqui para evitar loop

      if (!inst) {
        if (lastEditorTabRef.current) {
          delete editorRefs.current[lastEditorTabRef.current];
          lastEditorTabRef.current = null;
        }
        prevEditorInstRef.current = null;
        return;
      }

      editorRefs.current[currentTabId] = inst;
      lastEditorTabRef.current = currentTabId;
      prevEditorInstRef.current = inst;

      if (!selectionListenerGuard.current.has(inst)) {
        inst.onSelectionChange?.((kind) => {
          setSelectionKind(kind);
          if (kind === "none") {
            setSelectionInfo(null);
            setCanSaveSelectedImage(false);
          } else {
            setSelectionInfo(inst.getSelectionInfo?.() ?? null);
            setCanSaveSelectedImage(canSaveSelectedImageFromEditor(inst, kind));
          }
        });
        selectionListenerGuard.current.add(inst);
      }

      if (!cropListenerGuard.current.has(inst)) {
        inst.onCropModeChange?.((active) => {
          // Só atualiza o estado se este editor estiver na tab ativa
          if (currentTabId === activeCanvasTab) setCropModeActive(active);
        });
        cropListenerGuard.current.add(inst);
      }

      try {
        requestAnimationFrame(() => inst.refresh?.());
        setTimeout(() => inst.refresh?.(), 30);
      } catch { }

      // Removido: carregamento automático do snapshot para evitar bug de resetar posição dos objetos
    },
    [activeCanvasTab]
  );
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean>>({});
  // ── Drag state consolidado para performance ──
  type DragState = { tabId: string; pointerX: number; overSection: "visible" | "hidden" | null; insertIndex: number | null };
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragLiveRef = useRef<DragState | null>(null);
  const dragRafRef = useRef<number>(0);
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const visibleSectionRef = useRef<HTMLDivElement | null>(null);
  const hiddenSectionRef = useRef<HTMLDivElement | null>(null);
  const dragStartXRef = useRef(0);
  const dragTabElRectRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const ensureTabHasDecalPreviewRef = useRef<((tabId: string) => Promise<void>) | null>(null);
  const cachedTabRectsRef = useRef<{ id: string; left: number; right: number; midX: number }[]>([]);

  // Derived values from consolidated drag state (avoids breaking JSX references)
  const draggedTabId = dragState?.tabId ?? null;
  const dragPointerX = dragState?.pointerX ?? 0;
  const dragOverSection = dragState?.overSection ?? null;
  const dragInsertIndex = dragState?.insertIndex ?? null;

  /** Compute the insert index using cached rects (fast path) or DOM (fallback) */
  const computeVisibleInsertIndex = useCallback((pointerX: number, draggedId: string, useCached = true) => {
    // The 3D tab is always first; 2D tabs must have index >= 1
    const minIdx = draggedId !== "3d" ? 1 : 0;

    if (useCached && cachedTabRectsRef.current.length > 0) {
      const others = cachedTabRectsRef.current.filter((r) => r.id !== draggedId);
      for (let i = 0; i < others.length; i++) {
        if (pointerX < others[i].midX) return Math.max(i, minIdx);
      }
      return Math.max(others.length, minIdx);
    }
    // Fallback: read from DOM (used only on drop for accuracy)
    const section = visibleSectionRef.current;
    if (!section) return minIdx;
    const tabEls = Array.from(section.querySelectorAll<HTMLElement>("[data-tab-id]"));
    const others = tabEls.filter((el) => el.dataset.tabId !== draggedId);
    for (let i = 0; i < others.length; i++) {
      const rect = others[i].getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (pointerX < midX) return Math.max(i, minIdx);
    }
    return Math.max(others.length, minIdx);
  }, []);

  /** Cache all visible tab rects at drag start for fast hit-testing during move */
  const cacheVisibleTabRects = useCallback(() => {
    const section = visibleSectionRef.current;
    if (!section) { cachedTabRectsRef.current = []; return; }
    const tabEls = Array.from(section.querySelectorAll<HTMLElement>("[data-tab-id]"));
    cachedTabRectsRef.current = tabEls.map((el) => {
      const rect = el.getBoundingClientRect();
      return { id: el.dataset.tabId!, left: rect.left, right: rect.right, midX: rect.left + rect.width / 2 };
    });
  }, []);

  /** Schedule a single RAF-batched state update from the live ref */
  const scheduleDragUpdate = useCallback(() => {
    if (dragRafRef.current) return; // already scheduled
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = 0;
      const live = dragLiveRef.current;
      if (live) setDragState({ ...live });
    });
  }, []);

  const handleTabPointerDown = useCallback((e: React.PointerEvent, tabId: string) => {
    // Only primary button
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    dragTabElRectRef.current = { width: rect.width, height: rect.height };
    dragStartXRef.current = e.clientX;
    const pointerId = e.pointerId;
    // Threshold to distinguish click from drag
    const moveThreshold = 5;
    let started = false;

    const cleanup = () => {
      document.removeEventListener("pointermove", wrappedOnMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      if (dragRafRef.current) { cancelAnimationFrame(dragRafRef.current); dragRafRef.current = 0; }
      delete (window as any).__lastDragPointerClientX;
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!started && Math.abs(ev.clientX - dragStartXRef.current) < moveThreshold) return;
      if (!started) {
        started = true;
        cacheVisibleTabRects();
        // Set initial drag state immediately for first paint
        const initState = { tabId, pointerX: 0, overSection: null as "visible" | "hidden" | null, insertIndex: null as number | null };
        dragLiveRef.current = initState;
        setDragState(initState);
      }

      // Read container rect live (it changes as placeholders appear/disappear)
      const containerRect = tabContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      // Compute position relative to tab container
      const clampedX = Math.max(containerRect.left, Math.min(ev.clientX, containerRect.right - dragTabElRectRef.current.width));
      const pointerX = clampedX - containerRect.left;

      // Read section rects live (cheap, and they change as placeholders appear/disappear)
      const visRect = visibleSectionRef.current?.getBoundingClientRect();
      const hidRect = hiddenSectionRef.current?.getBoundingClientRect();

      // Determine which section the pointer is over + insert index
      let overSection: "visible" | "hidden" | null = null;
      let insertIndex: number | null = null;
      if (visRect && ev.clientX >= visRect.left && ev.clientX <= visRect.right) {
        overSection = "visible";
        insertIndex = computeVisibleInsertIndex(ev.clientX, tabId, true);
      } else if (hidRect && ev.clientX >= hidRect.left && ev.clientX <= hidRect.right) {
        overSection = "hidden";
      }

      // Update ref immediately (cheap), schedule batched state update
      dragLiveRef.current = { tabId, pointerX, overSection, insertIndex };
      scheduleDragUpdate();
    };

    const onUp = (ev?: PointerEvent) => {
      if (ev && ev.pointerId !== pointerId) return;
      // Read pointer position BEFORE cleanup deletes it
      const pointerX = (window as any).__lastDragPointerClientX ?? dragStartXRef.current;
      cleanup();
      if (!started) return;

      // Read section rects live for accurate drop detection
      const visRect = visibleSectionRef.current?.getBoundingClientRect();
      const hidRect = hiddenSectionRef.current?.getBoundingClientRect();
      let targetSection: "visible" | "hidden" | null = null;
      if (visRect && pointerX >= visRect.left && pointerX <= visRect.right) {
        targetSection = "visible";
      } else if (hidRect && pointerX >= hidRect.left && pointerX <= hidRect.right) {
        targetSection = "hidden";
      }

      if (targetSection === "visible") {
        // Ensure visibility for 2D tabs dropped in visible section
        if (tabId !== "3d" && !tabVisibilityRef.current[tabId]) {
          void (async () => { await ensureTabHasDecalPreviewRef.current?.(tabId); })();
        }
        if (tabId !== "3d") {
          setTabVisibility((prev) => {
            const next = { ...prev, [tabId]: true };
            tabVisibilityRef.current = next;
            return next;
          });
        }

        // Reorder: compute final insert index from DOM (accurate, not cached)
        const finalIdx = computeVisibleInsertIndex(pointerX, tabId, false);
        setCanvasTabs((prev) => {
          // Get list of visible tabs (3d + visible 2d) in current order
          const visibleIds = prev
            .filter((t) => t.type === "3d" || (t.type === "2d" && (tabVisibilityRef.current[t.id] || t.id === tabId)))
            .map((t) => t.id);
          const hiddenTabs = prev.filter(
            (t) => t.type === "2d" && !tabVisibilityRef.current[t.id] && t.id !== tabId
          );

          // Remove the dragged tab from visible list
          const withoutDragged = visibleIds.filter((id) => id !== tabId);
          // Insert at the computed position
          const insertAt = Math.min(finalIdx, withoutDragged.length);
          withoutDragged.splice(insertAt, 0, tabId);

          // Rebuild full tabs: visible (in new order) + hidden (preserving order)
          const tabMap = new Map(prev.map((t) => [t.id, t]));
          const next = [
            ...withoutDragged.map((id) => tabMap.get(id)!),
            ...hiddenTabs,
          ];
          canvasTabsRef.current = next;
          return next;
        });
      } else if (targetSection === "hidden" && tabId !== "3d") {
        setTabVisibility((prev) => {
          const next = { ...prev, [tabId]: false };
          tabVisibilityRef.current = next;
          return next;
        });
      }

      dragLiveRef.current = null;
      cachedTabRectsRef.current = [];
      setDragState(null);
    };

    const wrappedOnMove = (ev: PointerEvent) => {
      (window as any).__lastDragPointerClientX = ev.clientX;
      onMove(ev);
    };

    document.addEventListener("pointermove", wrappedOnMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }, [computeVisibleInsertIndex, cacheVisibleTabRects, scheduleDragUpdate]);
  const [tabDecalPreviews, setTabDecalPreviews] = useState<Record<string, string>>({});
  const [tabDecalPlacements, setTabDecalPlacements] = useState<Record<string, DecalTransform>>({});
  const [tabPrintTypes, setTabPrintTypes] = useState<Record<string, string>>({});
  /** Automatic gizmo dimensions derived from canvas content bounds (fallback for tabs without explicit placement). */
  const [tabDecalAutoSizes, setTabDecalAutoSizes] = useState<Record<string, { width: number; height: number }>>({});
  const tabDecalAutoSizesRef = useRef<Record<string, { width: number; height: number }>>({});
  const tabVisibilityRef = useRef<Record<string, boolean>>(tabVisibility);
  const tabDecalPreviewsRef = useRef<Record<string, string>>(tabDecalPreviews);
  const tabDecalPlacementsRef = useRef<Record<string, DecalTransform>>(tabDecalPlacements);
  const tabPrintTypesRef = useRef<Record<string, string>>(tabPrintTypes);
  useEffect(() => {
    tabVisibilityRef.current = tabVisibility;
  }, [tabVisibility]);
  useEffect(() => {
    tabDecalPreviewsRef.current = tabDecalPreviews;
  }, [tabDecalPreviews]);
  useEffect(() => {
    tabDecalPlacementsRef.current = tabDecalPlacements;
  }, [tabDecalPlacements]);
  useEffect(() => {
    tabPrintTypesRef.current = tabPrintTypes;
  }, [tabPrintTypes]);
  useEffect(() => {
    tabDecalAutoSizesRef.current = tabDecalAutoSizes;
  }, [tabDecalAutoSizes]);

  const captureTabImage = useCallback(async (tabId: string): Promise<string | null> => {
    const inst = editorRefs.current[tabId];
    if (!inst) return null;
    try {
      await inst.waitForIdle?.();
    } catch { }
    try {
      inst.refresh?.();
    } catch { }

    const fullDataUrl = inst.exportPNG?.() ?? null;
    const bounds = inst.getContentBounds?.() ?? null;

    let finalDataUrl: string | null = fullDataUrl;

    if (fullDataUrl && bounds) {
      // Crop the exported PNG to the actual content region so the 3D texture
      // fills the gizmo box completely (no transparent padding around the design).
      try {
        const img = new Image();
        img.src = fullDataUrl;
        await img.decode();
        const pw = img.naturalWidth;
        const ph = img.naturalHeight;
        const cropX = Math.round(bounds.ratioLeft * pw);
        const cropY = Math.round(bounds.ratioTop * ph);
        const cropW = Math.max(1, Math.round(bounds.ratioW * pw));
        const cropH = Math.max(1, Math.round(bounds.ratioH * ph));
        const offscreen = document.createElement("canvas");
        offscreen.width = cropW;
        offscreen.height = cropH;
        const ctx = offscreen.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          finalDataUrl = offscreen.toDataURL("image/png");
        }
      } catch {
        // fall back to full canvas PNG on any error
      }

      // --------------- Gizmo sizing ---------------
      // DECAL_DOMINANT_SIZE is the single reference parameter that controls
      // how large decals appear on the 3D model. It sets the world-unit size
      // of the dominant axis (width or height, whichever is larger).
      // The other axis is scaled proportionally to preserve the crop aspect ratio.
      //
      //   Increase DECAL_DOMINANT_SIZE → bigger decals on the model.
      //   Decrease DECAL_DOMINANT_SIZE → smaller decals on the model.
      //
      const DECAL_DOMINANT_SIZE = 0.85; // world units — change ONLY this value to resize all decals

      const cropAspect = bounds.ratioH > 0 ? bounds.ratioW / bounds.ratioH : 1; // W/H of crop
      let autoW: number, autoH: number;
      if (cropAspect >= 1) {
        // wider than tall — dominant axis is width
        autoW = DECAL_DOMINANT_SIZE;
        autoH = DECAL_DOMINANT_SIZE / cropAspect;
      } else {
        // taller than wide — dominant axis is height
        autoH = DECAL_DOMINANT_SIZE;
        autoW = DECAL_DOMINANT_SIZE * cropAspect;
      }
      const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      autoW = clamp(autoW, 0.10, 1.50);
      autoH = clamp(autoH, 0.10, 1.50);

      const prev = tabDecalAutoSizesRef.current;
      if (!prev[tabId] || Math.abs(prev[tabId].width - autoW) > 0.001 || Math.abs(prev[tabId].height - autoH) > 0.001) {
        const next = { ...prev, [tabId]: { width: autoW, height: autoH } };
        tabDecalAutoSizesRef.current = next;
        setTabDecalAutoSizes(next);
      }
    }

    if (finalDataUrl) {
      const current = tabDecalPreviewsRef.current;
      if (current[tabId] !== finalDataUrl) {
        const next = { ...current, [tabId]: finalDataUrl };
        tabDecalPreviewsRef.current = next;
        setTabDecalPreviews(next);
      }
    }

    return tabDecalPreviewsRef.current[tabId] ?? null;
  }, [setTabDecalPreviews, setTabDecalAutoSizes]);

  const ensureTabHasDecalPreview = useCallback(async (tabId: string) => {
    const result = await captureTabImage(tabId);
    if (result) return;
    setTabDecalPreviews((prev) => {
      if (prev[tabId]) return prev;
      const next = {
        ...prev,
        [tabId]: TRANSPARENT_PNG,
      };
      tabDecalPreviewsRef.current = next;
      return next;
    });
  }, [captureTabImage]);

  // Keep the ref in sync so handleTabPointerDown can use it
  useEffect(() => {
    ensureTabHasDecalPreviewRef.current = ensureTabHasDecalPreview;
  }, [ensureTabHasDecalPreview]);

  const decalsFor3D = useMemo<ExternalDecalData[]>(() => {
    return canvasTabs
      .filter((tab) => tab.type === "2d" && tabVisibility[tab.id] && tabDecalPreviews[tab.id])
      .map((tab) => {
        const placement = tabDecalPlacements[tab.id] ?? null;
        const autoSize = tabDecalAutoSizes[tab.id] ?? null;

        // autoSize (derived from 2D canvas content bounds) ALWAYS controls width/height.
        // placement only contributes position/normal/angle (where the user placed the decal in 3D).
        // This prevents the engine's initial default size (0.3) from polluting tabDecalPlacements
        // and permanently overriding the content-aware sizing.
        let transform: DecalTransform | null = null;
        if (autoSize) {
          transform = {
            width: autoSize.width,
            height: autoSize.height,
            position: placement?.position ?? null,
            normal: placement?.normal ?? null,
            angle: placement?.angle,
            depth: placement?.depth,
          };
        } else if (placement) {
          transform = placement;
        }

        return {
          id: tab.id,
          label: tab.name,
          dataUrl: tabDecalPreviews[tab.id],
          transform,
        };
      });
  }, [canvasTabs, tabDecalPreviews, tabVisibility, tabDecalPlacements, tabDecalAutoSizes]);

  const viabilityAlertItems = useMemo(() => {
    return Object.entries(decalViabilityAlerts).map(([id, messages]) => {
      const tab = canvasTabs.find((item) => item.id === id);
      return {
        id,
        label: tab?.name ?? id,
        messages,
      };
    });
  }, [canvasTabs, decalViabilityAlerts]);

  // Referência estável para os parâmetros do projeto atual
  const currentProjectRef = useRef<{ part: string | null, type: string | null, subtype: string | null }>({
    part: null, type: null, subtype: null
  });

  // Detecta mudanças significativas nos parâmetros do projeto
  useEffect(() => {
    const current = { part, type, subtype };
    const previous = currentProjectRef.current;

    // Só reseta se realmente mudou e não é a primeira carga
    const hasChanged = (previous.part !== null || previous.type !== null || previous.subtype !== null) &&
      (previous.part !== current.part || previous.type !== current.type || previous.subtype !== current.subtype);

    if (hasChanged) {
      resetProject();
      tabDecalPlacementsRef.current = {};
      setTabDecalPlacements({});
    }

    currentProjectRef.current = current;
  }, [part, type, subtype, resetProject]);

  const applyDraftPayload = (payload: any) => {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.projectName === "string") setProjectName(payload.projectName);
    if (typeof payload.baseColor === "string") setBaseColor(payload.baseColor);
    if (typeof payload.size === "string") setSize(payload.size);
    if (typeof payload.fabric === "string" && !isSubtypeFabricLocked) setFabric(payload.fabric);
    if (typeof payload.notes === "string") setNotes(payload.notes);

    let restoredTabs: CanvasTab[] = [];
    if (Array.isArray(payload.canvasTabs) && payload.canvasTabs.length) {
      restoredTabs = (payload.canvasTabs as CanvasTab[]).map((t) =>
        t.type === "3d" ? { ...t, name: subtype || t.name } : t
      );
      canvasTabsRef.current = restoredTabs;
      setCanvasTabs(restoredTabs);
    } else if (payload.canvasSnapshots && typeof payload.canvasSnapshots === "object") {
      const keys = Object.keys(payload.canvasSnapshots as Record<string, unknown>);
      if (keys.length) {
        restoredTabs = [{ id: "3d", name: subtype || "3D", type: "3d" }];
        keys.forEach((k, i) => restoredTabs.push({ id: k, name: `2D - ${i + 1}`, type: "2d" }));
        canvasTabsRef.current = restoredTabs;
        setCanvasTabs(restoredTabs);
      }
    }

    if (typeof payload.activeCanvasTab === "string") setActiveCanvasTab(payload.activeCanvasTab);
    if (payload.canvasSnapshots && typeof payload.canvasSnapshots === "object") {
      const snapshots = payload.canvasSnapshots as Record<string, string>;
      tabSnapshotsRef.current = snapshots;
      setTabSnapshots(snapshots);
      // Após restaurar os snapshots, garantir que cada Editor2D seja funcional
      setTimeout(() => {
        Object.entries(snapshots).forEach(([tabId, snap]) => {
          const editor = editorRefs.current[tabId];
          if (editor && typeof editor.loadFromJSON === "function") {
            editor.loadFromJSON(snap);
            editor.refresh?.();
          }
        });
      }, 100);
    }
    if (payload.tabVisibility && typeof payload.tabVisibility === "object") {
      const visibility = payload.tabVisibility as Record<string, boolean>;
      tabVisibilityRef.current = visibility;
      setTabVisibility(visibility);
    }
    if (payload.tabDecalPreviews && typeof payload.tabDecalPreviews === "object") {
      const previews = payload.tabDecalPreviews as Record<string, string>;
      tabDecalPreviewsRef.current = previews;
      setTabDecalPreviews(previews);
    }
    if (payload.tabDecalPlacements && typeof payload.tabDecalPlacements === "object") {
      const placements = payload.tabDecalPlacements as Record<string, DecalTransform>;
      tabDecalPlacementsRef.current = placements;
      setTabDecalPlacements(placements);
    }
    if (payload.tabPrintTypes && typeof payload.tabPrintTypes === "object") {
      const ptypes = payload.tabPrintTypes as Record<string, string>;
      tabPrintTypesRef.current = ptypes;
      setTabPrintTypes(ptypes);
    }

    if (typeof payload.isPermanent === "boolean") {
      isDraftPermanentRef.current = payload.isPermanent;
      setIsDraftPermanent(payload.isPermanent);
    } else if (payload.ephemeralExpiresAt) {
      isDraftPermanentRef.current = false;
      setIsDraftPermanent(false);
    } else {
      isDraftPermanentRef.current = true;
      setIsDraftPermanent(true);
    }
  };

  // Carrega projeto salvo (se existir) apenas uma vez na inicialização
  useEffect(() => {
    if (skipInitialLoadRef.current) {
      draftKeyRef.current = null;
      draftIdRef.current = null;
      setDraftId(null);
      isDraftPermanentRef.current = false;
      setIsDraftPermanent(false);
      try {
        localStorage.removeItem("currentProject");
      } catch { }
      return;
    }

    const legacyProjectKey = `${part || ""}:${type || ""}:${subtype || ""}:${projectName}`;

    const resolveMetadataFromLocal = () => {
      try {
        const stored = localStorage.getItem("currentProject");
        if (!stored) return;
        const parsed = JSON.parse(stored);
        if (!parsed || typeof parsed !== "object") return;
        if (!draftKeyRef.current && typeof parsed.draftKey === "string") draftKeyRef.current = parsed.draftKey;
        if (!draftKeyRef.current && typeof parsed.projectKey === "string") draftKeyRef.current = parsed.projectKey;
        if (!draftIdRef.current) {
          if (typeof parsed.draftId === "string") {
            draftIdRef.current = parsed.draftId;
            setDraftId(parsed.draftId);
          }
          else if (typeof parsed.draftId === "number") {
            draftIdRef.current = String(parsed.draftId);
            setDraftId(String(parsed.draftId));
          }
        }
      } catch { }
    };

    resolveMetadataFromLocal();

    let mounted = true;
    let remoteApplied = false;

    const loadRemote = async () => {
      try {
        if (!supabase) return;

        const targetDraftId = navigationState.draftId ?? draftIdRef.current;
        const targetDraftKey = draftKeyRef.current ?? navigationState.draftKey ?? navigationState.projectKey ?? null;

        let response: any = null;
        let error: any = null;

        if (targetDraftId) {
          const result = await supabase
            .from("project_drafts")
            .select("id, project_key, data")
            .eq("id", targetDraftId)
            .maybeSingle();
          response = result.data ?? null;
          error = result.error ?? null;
        } else if (targetDraftKey) {
          const result = await supabase
            .from("project_drafts")
            .select("id, project_key, data")
            .eq("project_key", targetDraftKey)
            .order("updated_at", { ascending: false })
            .maybeSingle();
          response = result.data ?? null;
          error = result.error ?? null;
        } else {
          const result = await supabase
            .from("project_drafts")
            .select("id, project_key, data")
            .eq("project_key", legacyProjectKey)
            .order("updated_at", { ascending: false })
            .maybeSingle();
          response = result.data ?? null;
          error = result.error ?? null;
        }

        if (error || !response || !mounted) return;

        const payload = { ...(response.data ?? {}) } as Record<string, unknown>;
        if (response.project_key) {
          const projectKeyStr = String(response.project_key);
          if (typeof payload.draftKey !== "string") payload.draftKey = projectKeyStr;
          if (typeof payload.projectKey !== "string") payload.projectKey = projectKeyStr;
        }
        if (response.id && typeof payload.draftId !== "string") payload.draftId = String(response.id);

        if (typeof payload.draftKey === "string") draftKeyRef.current = payload.draftKey;
        if (typeof payload.draftId === "string") {
          draftIdRef.current = payload.draftId;
          setDraftId(payload.draftId);
        }

        applyDraftPayload(payload);
        remoteApplied = true;

        try {
          localStorage.setItem("currentProject", JSON.stringify(payload));
        } catch { }
      } catch (err) {
        // silencioso, fallback local será acionado
      }
    };

    loadRemote().finally(() => {
      if (!mounted || remoteApplied) return;
      try {
        const stored = localStorage.getItem("currentProject");
        if (!stored) return;
        const project = JSON.parse(stored);
        if (!project || typeof project !== "object") return;

        if (typeof project.draftKey === "string" && !draftKeyRef.current) draftKeyRef.current = project.draftKey;
        if (typeof project.projectKey === "string" && !draftKeyRef.current) draftKeyRef.current = project.projectKey;
        if (!draftIdRef.current) {
          if (typeof project.draftId === "string") {
            draftIdRef.current = project.draftId;
            setDraftId(project.draftId);
          }
          else if (typeof project.draftId === "number") {
            draftIdRef.current = String(project.draftId);
            setDraftId(String(project.draftId));
          }
        }

        const isVeryDifferentProject =
          (project.part && part && project.part !== part) ||
          (project.type && type && project.type !== type) ||
          (project.subtype && subtype && project.subtype !== subtype);
        if (isVeryDifferentProject) {
          draftKeyRef.current = null;
          draftIdRef.current = null;
          setDraftId(null);
          localStorage.removeItem("currentProject");
          return;
        }

        applyDraftPayload(project);
      } catch {
        // fallback silencioso
      }
    });

    return () => {
      mounted = false;
    };
  }, []); // Executa apenas uma vez na montagem

  // Garante que a tab ativa só seja setada após as tabs serem restauradas
  useEffect(() => {
    const navActiveTab = navigationState?.activeCanvasTab;
    if (canvasTabs.length > 1 && typeof navActiveTab === "string") {
      setTimeout(() => {
        setActiveCanvasTab(navActiveTab);
      }, 50);
    }
  }, [canvasTabs, navigationState]);

  const activeIs2D = useMemo(
    () => canvasTabs.find((t) => t.id === activeCanvasTab)?.type === "2d",
    [canvasTabs, activeCanvasTab]
  );

  const [selectionKind, setSelectionKind] = useState<SelectionKind>("none");
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [canSaveSelectedImage, setCanSaveSelectedImage] = useState(false);
  const prevSelectionKindRef = useRef<SelectionKind>("none");
  const [cropModeActive, setCropModeActive] = useState(false);
  const [colorCutModeActive, setColorCutModeActive] = useState(false);
  const [effectsEditModeActive, setEffectsEditModeActive] = useState(false);
  const [bgRemovingTabId, setBgRemovingTabId] = useState<string | null>(null);
  const toolbarTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detecta mudança de toolbar ativa (não de seleção geral) e aplica transição flip
  useEffect(() => {
    const activeEditor = editorRefs.current[activeCanvasTab] as Editor2DHandle | undefined;
    const effectBrushActive = !!activeEditor?.isEffectBrushActive?.();
    const effectLassoActive = !!activeEditor?.isEffectLassoActive?.();
    const effectToolActive = effectBrushActive || effectLassoActive;
    const colorCutActive = colorCutModeActive || !!activeEditor?.isColorCutActive?.();
    const cropActive = cropModeActive;

    // Determina se há uma toolbar ativa (texto, imagem ou ferramentas especiais)
    const hasActiveToolbar =
      selectionKind === "text" ||
      selectionKind === "image" ||
      effectToolActive ||
      colorCutActive ||
      cropActive ||
      effectsEditModeActive;

    // Só faz transição se há uma mudança real de toolbar ativa
    if (prevSelectionKindRef.current !== selectionKind && hasActiveToolbar) {
      // Limpar timeout anterior se existir
      if (toolbarTransitionTimeoutRef.current) {
        clearTimeout(toolbarTransitionTimeoutRef.current);
      }

      setToolbarTransitionType("out");
      setIsToolbarTransitioning(true);

      toolbarTransitionTimeoutRef.current = setTimeout(() => {
        setToolbarTransitionType("in");
        toolbarTransitionTimeoutRef.current = setTimeout(() => {
          setIsToolbarTransitioning(false);
        }, 600); // Duração da animação flip-in
      }, 400); // Duração da animação flip-out

      prevSelectionKindRef.current = selectionKind;
    }

    // Cleanup ao desmontar ou ao mudar de tab
    return () => {
      if (toolbarTransitionTimeoutRef.current) {
        clearTimeout(toolbarTransitionTimeoutRef.current);
      }
    };
  }, [selectionKind, cropModeActive, colorCutModeActive, effectsEditModeActive, activeCanvasTab]);
  const cropListenerGuard = useRef<WeakSet<Editor2DHandle>>(new WeakSet());
  const colorCutListenerGuard = useRef<WeakSet<Editor2DHandle>>(new WeakSet());
  const effectsListenerGuard = useRef<WeakSet<Editor2DHandle>>(new WeakSet());

  const canSaveSelectedImageFromEditor = useCallback(
    (inst: Editor2DHandle | null | undefined, kind?: SelectionKind) => {
      if (!inst) return false;
      const resolvedKind = kind ?? (inst.getSelectionKind?.() || "none");
      if (resolvedKind !== "image") return false;
      return !!inst.hasSelectedImageVisualChanges?.();
    },
    []
  );

  const updateSelectionInfo = useCallback(() => {
    const inst = editorRefs.current[activeCanvasTab];
    if (!inst) {
      setSelectionInfo(null);
      setCanSaveSelectedImage(false);
      return;
    }
    const info = inst.getSelectionInfo?.();
    setSelectionInfo(info ?? null);
    setCanSaveSelectedImage(canSaveSelectedImageFromEditor(inst));
  }, [activeCanvasTab, canSaveSelectedImageFromEditor]);

  const runWithActiveEditor = useCallback(
    async (fn: (editor: Editor2DHandle) => unknown | Promise<unknown>) => {
      const inst = editorRefs.current[activeCanvasTab];
      if (!inst) return;
      await Promise.resolve(fn(inst));
      updateSelectionInfo();
    },
    [activeCanvasTab, updateSelectionInfo]
  );

  const handleContextMenu = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const inst = editorRefs.current[activeCanvasTab];
      if (!inst) {
        event.preventDefault();
        return;
      }

      // Tenta selecionar o objeto sob o cursor no clique direito (UX: "clicar com o botão direito sobre")
      try {
        const rect = squareCanvasRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
          event.preventDefault();
          return;
        }
        inst.selectObjectAt?.({
          x,
          y,
          containerWidth: rect.width,
          containerHeight: rect.height,
        });
      } catch { }

      try {
        const k = inst.getSelectionKind?.();
        if (k) setSelectionKind(k);
      } catch { }

      const info = inst.getSelectionInfo?.();
      if (!info || !info.hasSelection) {
        event.preventDefault();
        setSelectionInfo(null);
        setCanSaveSelectedImage(false);
        return;
      }
      setSelectionInfo(info);
      setCanSaveSelectedImage(canSaveSelectedImageFromEditor(inst));
    },
    [activeCanvasTab, canSaveSelectedImageFromEditor]
  );

  const saveSelectedImage = useCallback(async () => {
    if (!activeIs2D) return;

    await runWithActiveEditor(async (inst) => {
      try {
        await inst.waitForIdle?.();
      } catch { }
      try {
        inst.refresh?.();
      } catch { }

      const hasVisualChanges = !!inst.hasSelectedImageVisualChanges?.();
      if (!hasVisualChanges) {
        toast.error("Nenhuma alteracao visual para salvar.");
        return;
      }

      const dataUrl = inst.exportSelectionPNG?.();
      if (!dataUrl) {
        toast.error("Selecione uma imagem para salvar.");
        return;
      }

      const selectedMeta = inst.getSelectedImageGalleryMeta?.() || null;
      const selectedGroupId =
        typeof selectedMeta?.groupId === "string" && selectedMeta.groupId.length
          ? selectedMeta.groupId
          : null;

      // 1) Download local (PNG)
      try {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${slugify(projectName || "imagem") || "imagem"}-${Date.now()}.png`;
        a.click();
      } catch { }

      // 2) Salvar na galeria (Supabase Storage) para aparecer no UploadGallery
      if (!user?.id) {
        toast.error("Faça login para salvar na galeria (o download foi feito localmente).");
        return;
      }

      try {
        const blob = await (await fetch(dataUrl)).blob();
        const rawBaseName =
          (typeof selectedMeta?.originalName === "string" && selectedMeta.originalName.length
            ? selectedMeta.originalName
            : projectName || "imagem").replace(/\.[a-zA-Z0-9]+$/, "");
        const base = slugify(rawBaseName) || "imagem";
        const filename = selectedGroupId
          ? `${tsPrefix()}-${base}__g-${selectedGroupId}__v.png`
          : `${tsPrefix()}-${base}.png`;
        const path = `${user.id}/images/${filename}`;

        const { error: uploadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(path, blob, { upsert: false, contentType: "image/png" });
        if (uploadErr) throw uploadErr;

        const { error: visibilityErr } = await supabase.from("gallery_visibility").upsert(
          {
            user_id: user.id,
            storage_path: path,
            is_public: false,
          },
          { onConflict: "user_id,storage_path" }
        );
        if (visibilityErr && visibilityErr.code !== "42P01") throw visibilityErr;

        const { data: signed, error: signErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signErr) throw signErr;

        const previewUrl =
          signed?.signedUrl ||
          supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl ||
          dataUrl;

        try {
          window.dispatchEvent(
            new CustomEvent("uploadGallery:newItem", {
              detail: {
                id: path,
                previewUrl,
                originalName: `${base}.png`,
                sortKey: filename.slice(0, 17),
                userId: user.id,
                isPublic: false,
                groupId: selectedGroupId || undefined,
                isVariant: !!selectedGroupId,
              },
            })
          );
        } catch { }

        toast.success(
          selectedGroupId
            ? "Imagem salva na galeria como variacao da original."
            : "Imagem salva na galeria e baixada em PNG."
        );
      } catch (err: any) {
        console.error("[saveSelectedImage]", err);
        toast.error(err?.message || "Falha ao salvar na galeria.");
      }
    });
  }, [activeIs2D, projectName, runWithActiveEditor, user?.id]);

  useEffect(() => {
    if (!activeIs2D) {
      setCanUndo(false);
      setCanRedo(false);
      setSelectionKind("none");
      setSelectionInfo(null);
      setCanSaveSelectedImage(false);
      setCropModeActive(false);
      setColorCutModeActive(false);
      return;
    }
    updateSelectionInfo();
  }, [activeIs2D, updateSelectionInfo]);

  useEffect(() => {
    if (!activeIs2D) {
      setCropModeActive(false);
      setColorCutModeActive(false);
      return;
    }
    const inst = editorRefs.current[activeCanvasTab];
    setCropModeActive(!!inst?.isCropActive?.());
    setColorCutModeActive(!!inst?.isColorCutActive?.());
  }, [activeIs2D, activeCanvasTab]);

  const [tabSnapshots, setTabSnapshots] = useState<Record<string, string>>({});
  const tabSnapshotsRef = useRef<Record<string, string>>(tabSnapshots);
  useEffect(() => {
    tabSnapshotsRef.current = tabSnapshots;
  }, [tabSnapshots]);
  const pendingRemotePayloadRef = useRef<DraftPayload | null>(null);
  const remoteSaveTimeoutRef = useRef<number | null>(null);
  const remoteSaveInFlightRef = useRef(false);
  const scheduledDraftSaveRef = useRef<number | null>(null);
  const pendingScheduledTabRef = useRef<string | null>(null);
  const skipSnapshotReloadRef = useRef<Set<string>>(new Set());
  const saveActiveTabSnapshot = useCallback(async (tabId?: string): Promise<Record<string, string>> => {
    const id = tabId || activeCanvasTab;
    if (!id) return tabSnapshotsRef.current;
    // Captura imagem para preview 3D
    void captureTabImage(id);
    // Salva JSON apenas para persistência (draft/export)
    const tabType = canvasTabs.find(t => t.id === id)?.type;
    if (tabType === "2d") {
      const inst = editorRefs.current[id];
      if (inst?.waitForIdle) {
        try {
          await inst.waitForIdle();
        } catch { }
      }
      const json = inst?.toJSON?.();
      if (json && tabSnapshotsRef.current[id] !== json) {
        const next = { ...tabSnapshotsRef.current, [id]: json };
        tabSnapshotsRef.current = next;
        skipSnapshotReloadRef.current.add(id);
        setTabSnapshots(next);
        return next;
      }
    }
    return tabSnapshotsRef.current;
  }, [activeCanvasTab, canvasTabs, editorRefs, captureTabImage]);


  const syncFontsFromEditor = useCallback(
    (inst?: Editor2DHandle | null) => {
      const editorInstance = inst ?? editorRefs.current[activeCanvasTab];
      if (!editorInstance?.listUsedFonts) return;
      const fn = addRecentFontRef.current;
      if (!fn) return;
      try {
        const fonts = editorInstance.listUsedFonts();
        fonts.forEach((family) => fn(family));
      } catch { }
    },
    [activeCanvasTab]
  );

  useEffect(() => {
    if (!activeIs2D) return;
    const inst = editorRefs.current[activeCanvasTab];
    if (inst) {
      syncFontsFromEditor(inst);
      inst.refresh?.();
      setTimeout(() => inst.refresh?.(), 60);
    }
  }, [activeCanvasTab, activeIs2D, syncFontsFromEditor]);

  useEffect(() => {
    if (!activeIs2D) return;
    const inst = editorRefs.current[activeCanvasTab];
    const snap = tabSnapshotsRef.current[activeCanvasTab];
    if (inst && snap) {
      if (skipSnapshotReloadRef.current.has(activeCanvasTab)) {
        skipSnapshotReloadRef.current.delete(activeCanvasTab);
        return;
      }
      void (async () => {
        try {
          await inst.loadFromJSON?.(snap);
          syncFontsFromEditor(inst);
          inst.refresh?.();
        } catch { }
      })();
    }
  }, [activeIs2D, activeCanvasTab, tabSnapshots]);

  const addText = (value?: string) => {
    if (!activeIs2D) return;
    editorRefs.current[activeCanvasTab]?.addText(value || "digite aqui", { x: undefined, y: undefined });
    editorRefs.current[activeCanvasTab]?.setActiveTextStyle({ fontFamily: selectedFontFamily });
  };

  const add2DTab = () => {
    void saveActiveTabSnapshot();
    const id = `2d-${Date.now()}`;
    const count = canvasTabs.filter((t) => t.type === "2d").length + 1;
    const newTab: CanvasTab = { id, name: `2D - ${count}`, type: "2d" };
    setCanvasTabs((prev) => {
      const next = [...prev, newTab];
      canvasTabsRef.current = next;
      return next;
    });
    setActiveCanvasTab(id);
    setTabVisibility((prev) => {
      const next = { ...prev, [id]: false };
      tabVisibilityRef.current = next;
      return next;
    });
  };

  const removeCanvasTab = (tabId: string) => {
    if (tabId === "3d") return;
    setTabDecalPreviews((prev) => {
      const next = { ...prev };
      delete next[tabId];
      tabDecalPreviewsRef.current = next;
      return next;
    });
    setTabVisibility((prev) => {
      const next = { ...prev };
      delete next[tabId];
      tabVisibilityRef.current = next;
      return next;
    });
    setTabDecalPlacements((prev) => {
      if (!(tabId in prev)) return prev;
      const next = { ...prev };
      delete next[tabId];
      tabDecalPlacementsRef.current = next;
      return next;
    });
    const updated = canvasTabs.filter((t) => t.id !== tabId);
    canvasTabsRef.current = updated;
    setCanvasTabs(updated);
    if (activeCanvasTab === tabId) setActiveCanvasTab("3d");
    editorRefs.current[tabId] = null;
  };

  const addShape = (
    shape: ShapeKind,
    style?: { fillEnabled?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; opacity?: number }
  ) => {
    if (!activeIs2D) return;
    editorRefs.current[activeCanvasTab]?.addShape(shape, {
      strokeColor: style?.strokeColor ?? strokeColor,
      fillColor: style?.fillColor ?? fillColor,
      strokeWidth: style?.strokeWidth ?? strokeWidth,
      opacity: style?.opacity ?? opacity,
      fillEnabled: style?.fillEnabled,
    });
  };

  const clearActive = () => {
    if (!activeIs2D) return;
    editorRefs.current[activeCanvasTab]?.clear();
    setTabSnapshots((s) => {
      const next = { ...s };
      delete next[activeCanvasTab];
      tabSnapshotsRef.current = next;
      return next;
    });
    // Removido: resetProject(); - muito agressivo para limpar apenas um canvas
  };

  const exportActive = async () => {
    if (!activeIs2D) return;
    const inst = editorRefs.current[activeCanvasTab];
    if (!inst) return;
    try {
      await inst.waitForIdle?.();
    } catch { }
    try {
      inst.refresh?.();
    } catch { }
    const dataUrl = inst.exportPNG?.();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${projectName || "projeto"}-${activeCanvasTab}.png`;
    a.click();
  };

  const flushRemoteSave = useCallback(async () => {
    if (remoteSaveInFlightRef.current) return;
    if (!pendingRemotePayloadRef.current) return;
    if (!supabase || !user?.id) return;

    const payload = pendingRemotePayloadRef.current;
    pendingRemotePayloadRef.current = null;
    remoteSaveInFlightRef.current = true;

    try {
      const item = {
        user_id: user.id,
        project_key: payload.draftKey,
        data: payload,
        updated_at: payload.savedAt,
        ephemeral_expires_at: payload.ephemeralExpiresAt ?? null,
      } as const;

      const { data: upserted, error } = await supabase
        .from("project_drafts")
        .upsert(item, { onConflict: "user_id,project_key" })
        .select();
      if (error) {
        console.error("Falha ao salvar rascunho remoto:", error);
      } else if (upserted && upserted.length) {
        const first = upserted[0] as { id?: string; project_key?: string };
        if (first?.id) {
          draftIdRef.current = String(first.id);
          setDraftId(String(first.id));
        }
        if (first?.project_key) draftKeyRef.current = first.project_key;
      }
    } catch (err) {
      console.error("Erro ao persistir rascunho:", err);
    } finally {
      remoteSaveInFlightRef.current = false;
      if (pendingRemotePayloadRef.current && !remoteSaveTimeoutRef.current) {
        remoteSaveTimeoutRef.current = window.setTimeout(() => {
          remoteSaveTimeoutRef.current = null;
          void flushRemoteSave();
        }, 200);
      }
    }
  }, [user?.id]);

  const queueRemoteSave = useCallback(
    async (payload: DraftPayload, options?: { immediate?: boolean }) => {
      pendingRemotePayloadRef.current = payload;
      if (!supabase || !user?.id) return;

      if (options?.immediate) {
        if (remoteSaveTimeoutRef.current) {
          window.clearTimeout(remoteSaveTimeoutRef.current);
          remoteSaveTimeoutRef.current = null;
        }
        await flushRemoteSave();
        return;
      }

      if (remoteSaveTimeoutRef.current) return;

      remoteSaveTimeoutRef.current = window.setTimeout(() => {
        remoteSaveTimeoutRef.current = null;
        void flushRemoteSave();
      }, 700);
    },
    [flushRemoteSave, user?.id]
  );

  const saveDraft = useCallback(async (options?: SaveDraftOptions) => {
    if (scheduledDraftSaveRef.current) {
      window.clearTimeout(scheduledDraftSaveRef.current);
      scheduledDraftSaveRef.current = null;
    }
    pendingScheduledTabRef.current = null;

    const snapshotMap = await saveActiveTabSnapshot(options?.tabId);

    // Se estiver na aba 3D (ou sem tab específica), garante preview das abas 2D visíveis.
    if (!options?.tabId && activeCanvasTab === "3d") {
      const visible2DTabs = canvasTabsRef.current.filter((t) => t.type === "2d" && tabVisibilityRef.current[t.id]);
      if (visible2DTabs.length > 0) {
        await Promise.all(visible2DTabs.map((t) => captureTabImage(t.id)));
      }
    }

    const canvasSnapshots = snapshotMap ?? tabSnapshotsRef.current;
    let draftKey = draftKeyRef.current;
    if (!draftKey) {
      draftKey =
        typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      draftKeyRef.current = draftKey;
    }
    const nowIso = new Date().toISOString();
    if (options?.markPermanent) {
      isDraftPermanentRef.current = true;
      setIsDraftPermanent(true);
    }
    const isPermanent = isDraftPermanentRef.current;
    const expiresAt = isPermanent
      ? null
      : new Date(Date.now() + DRAFT_EPHEMERAL_TTL_MS).toISOString();
    const payload: DraftPayload = {
      projectName,
      baseColor,
      size,
      fabric,
      notes,
      part,
      type,
      subtype,
      canvasSnapshots,
      canvasTabs: canvasTabsRef.current,
      tabVisibility: tabVisibilityRef.current,
      tabDecalPreviews: tabDecalPreviewsRef.current,
      tabDecalPlacements: tabDecalPlacementsRef.current,
      tabPrintTypes: tabPrintTypesRef.current,
      activeCanvasTab,
      savedAt: nowIso,
      draftKey,
      draftId: draftIdRef.current ?? undefined,
      projectKey: draftKey,
      isPermanent,
      ephemeralExpiresAt: expiresAt,
    };

    try {
      localStorage.setItem("currentProject", JSON.stringify(payload));
    } catch { }

    if (options?.immediateRemote) {
      await queueRemoteSave(payload, { immediate: true });
    } else {
      void queueRemoteSave(payload);
    }

    return payload;
  }, [activeCanvasTab, baseColor, captureTabImage, fabric, notes, part, queueRemoteSave, saveActiveTabSnapshot, size, subtype, projectName, type]);

  useEffect(() => {
    if (initialDraftSavedRef.current) return;
    initialDraftSavedRef.current = true;
    void saveDraft();
  }, [saveDraft]);

  const scheduleDraftSave = useCallback(
    (options?: SaveDraftOptions) => {
      if (options?.tabId) {
        pendingScheduledTabRef.current = options.tabId;
      }

      if (options?.immediateRemote) {
        if (scheduledDraftSaveRef.current) {
          window.clearTimeout(scheduledDraftSaveRef.current);
          scheduledDraftSaveRef.current = null;
        }
        const tabId = options?.tabId ?? pendingScheduledTabRef.current ?? undefined;
        pendingScheduledTabRef.current = null;
        void saveDraft({ immediateRemote: true, tabId, markPermanent: options?.markPermanent });
        return;
      }

      if (scheduledDraftSaveRef.current) return;

      scheduledDraftSaveRef.current = window.setTimeout(() => {
        scheduledDraftSaveRef.current = null;
        const tabId = pendingScheduledTabRef.current ?? undefined;
        pendingScheduledTabRef.current = null;
        void saveDraft({ tabId });
      }, 500);
    },
    [saveDraft]
  );

  const handleDecalStateChange = useCallback(
    (snapshots: DecalStateSnapshot[]) => {
      const nextAlerts: Record<string, string[]> = {};
      const minArea = subtypePrintConstraints?.min_decal_area_cm2 ?? 5;
      const neckYMin = subtypePrintConstraints?.neck_zone_y_min ?? 0.82;
      const underarmYMin = subtypePrintConstraints?.underarm_zone_y_min ?? 0.45;
      const underarmYMax = subtypePrintConstraints?.underarm_zone_y_max ?? 0.72;
      const underarmAbsXMin = subtypePrintConstraints?.underarm_zone_abs_x_min ?? 0.55;

      snapshots.forEach((snapshot) => {
        const warnings = new Set<string>(snapshot.viability?.warnings ?? []);

        const approxAreaCm2 = snapshot.viability?.approxAreaCm2;
        if (typeof approxAreaCm2 === "number" && approxAreaCm2 > 0 && approxAreaCm2 < minArea) {
          warnings.add("min_area_violation");
        }

        const np = snapshot.viability?.normalizedPosition;
        if (np && typeof np.x === "number" && typeof np.y === "number") {
          if (np.y >= neckYMin) {
            warnings.add("neck_zone_risk");
          }

          const centerX = Math.abs((np.x - 0.5) * 2);
          if (centerX >= underarmAbsXMin && np.y >= underarmYMin && np.y <= underarmYMax) {
            warnings.add("underarm_zone_risk");
          }
        }

        if (warnings.size > 0) {
          nextAlerts[snapshot.id] = Array.from(warnings).map(
            (code) => VIABILITY_WARNING_LABELS[code] ?? code
          );
        }
      });

      setDecalViabilityAlerts(nextAlerts);

      let placementsChanged = false;
      setTabDecalPlacements((prev) => {
        const snapshotIds = new Set(snapshots.map((s) => s.id));
        const next: Record<string, DecalTransform> = { ...prev };

        snapshots.forEach((snapshot) => {
          next[snapshot.id] = {
            position: snapshot.position ? { ...snapshot.position } : null,
            normal: snapshot.normal ? { ...snapshot.normal } : null,
            width: snapshot.width,
            height: snapshot.height,
            depth: snapshot.depth,
            angle: snapshot.angle,
          };
        });

        Object.keys(next).forEach((key) => {
          if (snapshotIds.has(key)) return;
          const visibility = tabVisibilityRef.current[key];
          if (visibility === undefined || visibility) {
            delete next[key];
          }
        });

        if (decalMapEquals(prev, next)) return prev;
        tabDecalPlacementsRef.current = next;
        placementsChanged = true;
        return next;
      });
      if (placementsChanged) {
        scheduleDraftSave();
      }
    },
    [scheduleDraftSave, subtypePrintConstraints]
  );

  useEffect(() => {
    if (prevSavedTabRef.current && prevSavedTabRef.current !== activeCanvasTab) {
      void saveActiveTabSnapshot(prevSavedTabRef.current);

      if (activeCanvasTab === "3d") {
        const visible2DTabs = canvasTabsRef.current.filter(t => t.type === "2d" && tabVisibilityRef.current[t.id]);
        Promise.all(visible2DTabs.map(t => captureTabImage(t.id))).catch(() => { });
      }

      void saveDraft();
    }
    prevSavedTabRef.current = activeCanvasTab;
  }, [activeCanvasTab, saveActiveTabSnapshot, saveDraft, captureTabImage]);

  useEffect(() => {
    if (user?.id && pendingRemotePayloadRef.current) {
      void queueRemoteSave(pendingRemotePayloadRef.current, { immediate: true });
    }
  }, [queueRemoteSave, user?.id]);

  useEffect(() => {
    return () => {
      if (remoteSaveTimeoutRef.current) {
        window.clearTimeout(remoteSaveTimeoutRef.current);
        remoteSaveTimeoutRef.current = null;
      }
      if (scheduledDraftSaveRef.current) {
        window.clearTimeout(scheduledDraftSaveRef.current);
        scheduledDraftSaveRef.current = null;
      }
    };
  }, []);

  // Salva automaticamente quando o usuário fecha/recarga a página
  useEffect(() => {
    const onUnload = () => {
      try {
        void saveDraft({ immediateRemote: true });
      } catch { }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [saveDraft]);

  const finish = () => {
    void (async () => {
      await saveDraft({ immediateRemote: true });
      navigate("/finalize");
    })();
  };

  const visibleTabsWithPreviews = useMemo(() => {
    return canvasTabs
      .filter((t) => t.type === "2d" && tabVisibility[t.id])
      .map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type as "2d" | "3d",
        dataUrl: tabDecalPreviews[t.id] ?? null,
      }));
  }, [canvasTabs, tabVisibility, tabDecalPreviews]);

  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-background">
      <Header />

      <main className="flex-1 min-h-0 w-full overflow-hidden">
        {/* Layout responsivo: empilha no mobile, 2 colunas no desktop, sem espaços (brutalismo) */}
        <section className="grid h-full w-full min-h-0 overflow-hidden grid-cols-1 [grid-template-rows:auto_minmax(0,1fr)] lg:[grid-template-rows:1fr] lg:[grid-template-columns:auto_minmax(0,1fr)] overflow-x-hidden">

          {/* Sidebar toma 100% da altura do grid. Borda a direita no lg */}
          <div className="h-auto lg:h-full min-h-0 min-w-0 max-h-[40dvh] lg:max-h-none overflow-y-auto overflow-x-hidden border-b lg:border-b-0 lg:border-r border-border">
            <ExpandableSidebar
              projectId={draftId}
              projectName={projectName}
              setProjectName={setProjectName}
              baseColor={baseColor}
              setBaseColor={setBaseColor}
              size={size}
              setSize={setSize}
              fabric={fabric}
              setFabric={setFabric}
              fabricLocked={isSubtypeFabricLocked || Boolean(fixedSubtypeFabric)}
              tabPrintTypes={tabPrintTypes}
              setTabPrintType={(tabId, value) => {
                setTabPrintTypes((prev) => ({ ...prev, [tabId]: value }));
              }}
              visibleTabs={visibleTabsWithPreviews}
              onExpandChange={() => { }}
              tool={tool}
              setTool={setTool}
              stampImageSrc={stampImageSrc}
              setStampImageSrc={setStampImageSrc}
              brushVariant={brushVariant}
              setBrushVariant={setBrushVariant}
              strokeColor={strokeColor}
              setStrokeColor={setStrokeColor}
              fillColor={fillColor}
              setFillColor={setFillColor}
              strokeWidth={strokeWidth}
              setStrokeWidth={setStrokeWidth}
              opacity={opacity}
              setOpacity={setOpacity}
              addShape={addShape}
              is2DActive={activeIs2D}
              continuousLineEnabled={continuousLineMode}
              onContinuousLineToggle={(value) => {
                setContinuousLineMode(value);
                runWithActiveEditor((inst) => inst.refresh?.());
              }}
              onImageInsert={(src, opts) => {
                console.log('[Creation onImageInsert]', { activeIs2D, activeCanvasTab, editorRef: !!editorRefs.current[activeCanvasTab] });
                if (activeIs2D) {
                  editorRefs.current[activeCanvasTab]?.addImage(src, opts);
                  return;
                }

                // Fallback: garantir uma aba 2D ativa e inserir lá
                const existing2D = canvasTabs.find((t) => t.type === "2d");
                if (existing2D) {
                  void saveActiveTabSnapshot();
                  setActiveCanvasTab(existing2D.id);
                  // aguarda montagem do Editor2D
                  setTimeout(() => {
                    editorRefs.current[existing2D.id]?.addImage(src, opts);
                  }, 60);
                } else {
                  // cria nova aba 2D e agenda a inserção nela
                  const newId = `2d-${Date.now()}`;
                  const count = canvasTabs.filter((t) => t.type === "2d").length + 1;
                  void saveActiveTabSnapshot();
                  const newTab: CanvasTab = { id: newId, name: `2D - ${count}`, type: "2d" };
                  setCanvasTabs((prev) => {
                    const next = [...prev, newTab];
                    canvasTabsRef.current = next;
                    return next;
                  });
                  setActiveCanvasTab(newId);
                  setTabVisibility((prev) => {
                    const next = { ...prev, [newId]: false };
                    tabVisibilityRef.current = next;
                    return next;
                  });
                  setTimeout(() => {
                    editorRefs.current[newId]?.addImage(src, opts);
                  }, 100);
                }
              }}
              onImageInserted={() => {
                // Callback para quando uma imagem é inserida
                // Pode ser usado para lógica adicional, como analytics
                console.log('[Creation] Image inserted, tool switched to select');
              }}
              addText={addText}
              applyTextStyle={async (patch) => {
                if (patch.fontFamily) {
                  setSelectedFontFamily(patch.fontFamily);
                }
                await editorRefs.current[activeCanvasTab]?.setActiveTextStyle({ ...patch, from: "font-picker" });
              }}
            />
          </div>

          {/* Coluna direita: canvas e ferramentas */}
          <div className="flex flex-col h-full min-w-0 min-h-0 bg-background relative">

            {/* Abas do canvas — Docked no topo separadas por 1px */}
            <div
              ref={tabContainerRef}
              className="w-full flex-none flex items-center border-b border-border bg-background p-2 z-20 overflow-x-auto overflow-y-hidden relative"
            >
              <div className="flex items-center w-full justify-between relative">
                <div className="flex flex-nowrap items-stretch gap-0 whitespace-nowrap relative">
                  {/* === Seção: Na peça (visível no 3D) === */}
                  <div
                    ref={visibleSectionRef}
                    className={`flex flex-nowrap items-center gap-1 px-0.5 rounded-lg transition-colors duration-200 ${dragOverSection === "visible" ? "bg-blue-500/25 ring-2 ring-blue-400/60" : ""
                      }`}
                    title="Na peça"
                  >
                    {/* Unified rendering of all visible tabs (3D + visible 2D) in canvasTabs order */}
                    {(() => {
                      const visibleTabs = canvasTabs.filter(
                        (t) => t.type === "3d" || (t.type === "2d" && !!tabVisibility[t.id])
                      );
                      const items: React.ReactNode[] = [];
                      const withoutDragged = visibleTabs.filter((t) => t.id !== draggedTabId);
                      const showPlaceholder = draggedTabId && dragOverSection === "visible" && dragInsertIndex !== null;

                      withoutDragged.forEach((tab, idx) => {
                        if (showPlaceholder && dragInsertIndex === idx) {
                          items.push(
                            <div
                              key="drop-placeholder"
                              className="w-14 h-8 rounded-lg bg-blue-400/10 shrink-0 transition-all duration-200"
                            />
                          );
                        }

                        const isDragging = draggedTabId === tab.id;
                        const active = tab.id === activeCanvasTab;
                        const is3D = tab.type === "3d";

                        items.push(
                          <div
                            key={tab.id}
                            data-tab-id={tab.id}
                            onPointerDown={(e) => handleTabPointerDown(e, tab.id)}
                            className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 h-8 text-xs font-medium border border-white/25 transition-colors duration-150 cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-30" : ""
                              } ${!isDragging && active
                                ? is3D
                                  ? "bg-gradient-to-r from-violet-600 to-purple-500 text-white shadow-md shadow-violet-500/25"
                                  : "bg-white/20 shadow-sm"
                                : !isDragging
                                  ? is3D
                                    ? "bg-violet-500/15 text-violet-200 hover:bg-violet-500/25"
                                    : "hover:bg-white/10"
                                  : ""
                              } ${active && isTransitioning && !isDragging ? "bounce-in" : ""}`}
                          >
                            <span
                              className="text-left focus:outline-none inline-flex items-center cursor-pointer min-w-0 max-w-[8rem] sm:max-w-[10rem] truncate"
                              aria-pressed={active}
                              tabIndex={0}
                              role="button"
                              onClick={() => {
                                if (draggedTabId) return;
                                setActiveCanvasTab(tab.id);
                                void (async () => {
                                  await saveActiveTabSnapshot();
                                  await saveDraft();
                                })();
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setActiveCanvasTab(tab.id);
                                  void (async () => {
                                    await saveActiveTabSnapshot();
                                    await saveDraft();
                                  })();
                                }
                              }}
                            >
                              {tab.name}
                            </span>
                            {tab.type === "2d" && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeCanvasTab(tab.id); }}
                                className="p-0.5 rounded-md hover:bg-white/20 transition-colors"
                                aria-label="Fechar aba"
                                title="Fechar aba"
                              >
                                <X className="w-3.5 h-3.5 opacity-50 hover:opacity-100" />
                              </button>
                            )}
                          </div>
                        );
                      });

                      if (showPlaceholder && dragInsertIndex! >= withoutDragged.length) {
                        items.push(
                          <div
                            key="drop-placeholder"
                            className="w-14 h-8 rounded-lg bg-blue-400/10 shrink-0 transition-all duration-200"
                          />
                        );
                      }

                      return items;
                    })()}
                  </div>

                  {/* Divisor vertical animado (O Olho) */}
                  <EyeTabDivider isDragging={!!draggedTabId} />

                  {/* === Seção: Somente canvas (não projetado no 3D) === */}
                  <div
                    ref={hiddenSectionRef}
                    className={`flex flex-nowrap items-center justify-center gap-1 px-0.5 min-w-[3rem] rounded-lg transition-colors duration-200 ${dragOverSection === "hidden" ? "bg-slate-400/25 ring-2 ring-slate-400/40" : ""
                      }`}
                    title="Somente canvas"
                  >
                    {draggedTabId && dragOverSection === "hidden" && !!tabVisibility[draggedTabId] && (
                      <div className="w-14 h-8 rounded-lg bg-slate-400/10 shrink-0 transition-all duration-200" />
                    )}
                    {canvasTabs.filter((t) => t.type === "2d" && !tabVisibility[t.id]).map((tab) => {
                      const isDragging = draggedTabId === tab.id;
                      const active = tab.id === activeCanvasTab;
                      return (
                        <div key={tab.id} className="flex items-center">
                          {isDragging && dragOverSection === "hidden" && (
                            <div className="w-14 h-8 rounded-lg bg-slate-400/10 shrink-0 transition-all duration-200" />
                          )}
                          <div
                            onPointerDown={(e) => handleTabPointerDown(e, tab.id)}
                            className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 h-8 text-xs font-medium border border-white/25 transition-colors duration-150 cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-30" : ""
                              } ${!isDragging && active ? "bg-white/20 shadow-sm" : !isDragging ? "hover:bg-white/10" : ""
                              } ${active && isTransitioning && !isDragging ? "bounce-in" : ""}`}
                          >
                            <span
                              className="text-left focus:outline-none inline-flex items-center cursor-pointer min-w-0 max-w-[8rem] sm:max-w-[10rem] truncate"
                              aria-pressed={active}
                              tabIndex={0}
                              role="button"
                              onClick={() => {
                                if (draggedTabId) return;
                                setActiveCanvasTab(tab.id);
                                void (async () => {
                                  await saveActiveTabSnapshot();
                                  await saveDraft();
                                })();
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  setActiveCanvasTab(tab.id);
                                  void (async () => {
                                    await saveActiveTabSnapshot();
                                    await saveDraft();
                                  })();
                                }
                              }}
                            >
                              {tab.name}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeCanvasTab(tab.id); }}
                              className="p-0.5 rounded-md hover:bg-white/20 transition-colors"
                              aria-label="Fechar aba"
                              title="Fechar aba"
                            >
                              <X className="w-3.5 h-3.5 opacity-50 hover:opacity-100" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <Button
                      onClick={add2DTab}
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-8 w-8 rounded-lg"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Floating drag preview — constrained within container */}
                {draggedTabId && dragOverSection === "visible" && (() => {
                  const draggedTab = canvasTabs.find((t) => t.id === draggedTabId);
                  if (!draggedTab) return null;
                  return (
                    <div
                      className="absolute top-0 h-full flex items-center pointer-events-none z-50"
                      style={{
                        left: `${dragPointerX}px`,
                        transition: "none",
                      }}
                    >
                      <div className="bg-white/15 backdrop-blur-xl rounded-lg px-2.5 h-8 text-xs font-medium flex items-center shadow-lg border border-white/30 opacity-90">
                        {draggedTab.name}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {!isDraftPermanent && (
                <div className="flex-none ml-4 flex items-center gap-2 pr-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none uppercase tracking-widest text-xs h-8 px-4"
                    onClick={() => {
                      void saveDraft({ immediateRemote: true, markPermanent: true });
                    }}
                  >
                    Salvar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-none uppercase tracking-widest text-xs h-8 px-4"
                    onClick={finish}
                  >
                    Produzir
                  </Button>
                </div>
              )}
            </div>

            {/* === ÁREA DO CANVAS (preenche a altura RESTANTE) === */}
            <div className="relative w-full flex-1 min-h-0 overflow-hidden min-w-0 bg-background">
              <div
                className="absolute inset-0"
                style={{
                  visibility: activeCanvasTab === "3d" ? "visible" : "hidden",
                  pointerEvents: activeCanvasTab === "3d" ? "auto" : "none",
                  zIndex: activeCanvasTab === "3d" ? 2 : 1,
                }}
              >
                <div
                  className={`${activeCanvasTab === "3d" && isTransitioning
                    ? tabTransitionDirection === "right"
                      ? "slide-in-right"
                      : "slide-in-left"
                    : ""
                    }`}
                  style={{ position: "absolute", inset: 0 }}
                >
                  <Canvas3DViewer
                    baseColor={baseColor}
                    externalDecals={decalsFor3D}
                    onDecalsChange={handleDecalStateChange}
                    decalZonesOverride={subtypeDecalZonesOverride}
                  />
                  {subtypePrintConstraints && (
                    <div className="absolute top-3 left-3 max-w-xs rounded border border-amber-300/70 bg-amber-50/85 px-2 py-1 text-[11px] text-amber-900">
                      Area util: {subtypePrintConstraints.print_area_width_cm ?? "-"} x {subtypePrintConstraints.print_area_height_cm ?? "-"} cm
                      <br />
                      Minimo: {subtypePrintConstraints.min_decal_area_cm2 ?? 5} cm²
                    </div>
                  )}
                  {viabilityAlertItems.length > 0 && (
                    <div className="absolute top-3 right-3 z-10 max-w-sm space-y-2">
                      {viabilityAlertItems.map((item) => (
                        <div key={item.id} className="rounded border border-red-300 bg-red-50/95 px-3 py-2 text-xs text-red-900">
                          <p className="font-semibold">{item.label}</p>
                          {item.messages.map((message, index) => (
                            <p key={`${item.id}-${index}`}>- {message}</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 text-xs text-gray-700 dark:text-gray-300 glass px-2 py-1 rounded">
                    Arraste para rotacionar · Scroll para zoom
                  </div>
                </div>

                <div className="absolute left-1/2 bottom-6 z-10 max-w-[95vw] -translate-x-1/2">
                  {(tool !== "select" || isTrashMode) && (
                    <FloatingEditorToolbar
                      strokeColor={strokeColor}
                      setStrokeColor={setStrokeColor}
                      stampColor={stampColor}
                      setStampColor={setStampColor}
                      stampDensity={stampDensity}
                      setStampDensity={setStampDensity}
                      strokeWidth={strokeWidth}
                      setStrokeWidth={setStrokeWidth}
                      opacity={opacity}
                      setOpacity={setOpacity}
                      tool={tool}
                      setTool={setTool}
                      isTrashMode={isTrashMode}
                      setTrashMode={setTrashMode}
                      selectionKind="none"
                      editor2DRef={editorRefs.current[activeCanvasTab] as Editor2DHandle}
                      onUndo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.undo?.() : undefined}
                      onRedo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.redo?.() : undefined}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      onApplyGradient={(gradient) => editorRefs.current[activeCanvasTab]?.applyGradientToSelection?.(gradient)}
                    />
                  )}
                </div>
              </div>

              <div
                className="absolute inset-0"
                style={{
                  visibility: activeCanvasTab !== "3d" ? "visible" : "hidden",
                  pointerEvents: activeCanvasTab !== "3d" ? "auto" : "none",
                  zIndex: activeCanvasTab !== "3d" ? 2 : 1,
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      ref={twoDViewportRef}
                      className="absolute inset-0 flex items-center justify-center"
                      onContextMenu={handleContextMenu}
                    >
                      <div
                        ref={squareCanvasRef}
                        className={`relative overflow-hidden ${activeCanvasTab !== "3d" && isTransitioning
                          ? tabTransitionDirection === "left"
                            ? "slide-in-left"
                            : "slide-in-right"
                          : ""
                          }`}
                        style={
                          squareViewportSize
                            ? { width: `${squareViewportSize}px`, height: `${squareViewportSize}px` }
                            : { width: "100%", height: "100%" }
                        }
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const src = e.dataTransfer.getData("text/plain");
                          const rawMeta = e.dataTransfer.getData("application/x-molda-gallery-meta");
                          let parsedMeta: Record<string, unknown> | undefined;
                          if (rawMeta) {
                            try {
                              const parsed = JSON.parse(rawMeta);
                              if (parsed && typeof parsed === "object") parsedMeta = parsed;
                            } catch { }
                          }
                          const rect = squareCanvasRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const x = e.clientX - rect.left;
                          const y = e.clientY - rect.top;
                          if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
                          if (src && activeIs2D) {
                            editorRefs.current[activeCanvasTab]?.addImage(src, { x, y, meta: parsedMeta });
                          }
                        }}
                      >
                        {canvasTabs
                          .filter((tab) => tab.type === "2d")
                          .map((tab) => (
                            <div
                              key={tab.id}
                              style={{
                                position: "absolute",
                                inset: 0,
                                visibility: tab.id === activeCanvasTab ? "visible" : "hidden",
                                pointerEvents: tab.id === activeCanvasTab ? "auto" : "none",
                                zIndex: tab.id === activeCanvasTab ? 2 : 1,
                              }}
                            >
                              {/* Overlay de loading restrito à tab onde ocorre a remoção de fundo */}
                              {bgRemovingTabId === tab.id && (
                                <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-white/60 dark:bg-black/50 backdrop-blur-sm">
                                  <svg className="h-8 w-8 animate-spin text-foreground/70" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                </div>
                              )}
                              <div
                                style={{
                                  position: "absolute",
                                  inset: 0,
                                  visibility: "inherit",
                                  pointerEvents: "inherit",
                                }}
                              >
                                <Editor2D
                                  ref={(inst) => {
                                    if (!inst) return;

                                    // mantém a ref atualizada (mesmo que já exista)
                                    editorRefs.current[tab.id] = inst;

                                    if (!selectionListenerGuard.current.has(inst)) {
                                      inst.onSelectionChange?.((kind) => {
                                        if (tab.id === activeCanvasTab) {
                                          setSelectionKind(kind);
                                          if (kind === "none") {
                                            setSelectionInfo(null);
                                            setCanSaveSelectedImage(false);
                                          } else {
                                            setSelectionInfo(inst.getSelectionInfo?.() ?? null);
                                            setCanSaveSelectedImage(canSaveSelectedImageFromEditor(inst, kind));
                                          }
                                        }
                                      });
                                      selectionListenerGuard.current.add(inst);
                                    }

                                    if (!cropListenerGuard.current.has(inst)) {
                                      inst.onCropModeChange?.((active) => {
                                        if (tab.id === activeCanvasTab) setCropModeActive(active);
                                      });
                                      cropListenerGuard.current.add(inst);
                                    }

                                    if (!colorCutListenerGuard.current.has(inst)) {
                                      inst.onColorCutModeChange?.((active) => {
                                        if (tab.id === activeCanvasTab) setColorCutModeActive(active);
                                      });
                                      colorCutListenerGuard.current.add(inst);
                                    }

                                    if (!effectsListenerGuard.current.has(inst)) {
                                      inst.onEffectEditModeChange?.((active) => {
                                        if (tab.id === activeCanvasTab) setEffectsEditModeActive(active);
                                      });
                                      effectsListenerGuard.current.add(inst);
                                    }

                                    // sincroniza o estado imediatamente ao montar/reativar
                                    if (tab.id === activeCanvasTab) {
                                      setCropModeActive(!!inst.isCropActive?.());
                                      setEffectsEditModeActive(!!inst.isEffectBrushActive?.() || !!inst.isEffectLassoActive?.());
                                      setColorCutModeActive(!!inst.isColorCutActive?.());
                                    }
                                  }}
                                  isActive={activeIs2D && tab.id === activeCanvasTab}
                                  tool={tool}
                                  stampSrc={stampSrc}
                                  stampDensity={stampDensity}
                                  brushVariant={brushVariant}
                                  continuousLineMode={continuousLineMode}
                                  onRequestToolChange={(nextTool) => {
                                    // Editor requests changing tool (e.g., auto-switch to select after finishing a curve)
                                    setTool(nextTool);
                                  }}
                                  onContinuousLineCancel={() => {
                                    setContinuousLineMode(false);
                                    runWithActiveEditor((inst) => inst.refresh?.());
                                  }}
                                  strokeColor={strokeColor}
                                  fillColor={fillColor}
                                  strokeWidth={strokeWidth}
                                  opacity={opacity}
                                  isTrashMode={isTrashMode}
                                  onTrashDelete={() => setTool("select")}
                                  onHistoryChange={(u, r) => {
                                    if (tab.id === activeCanvasTab) {
                                      setCanUndo(u);
                                      setCanRedo(r);
                                      if (tabVisibility[tab.id]) {
                                        void captureTabImage(tab.id);
                                      }
                                      // Salva o rascunho automaticamente a cada modificação
                                      scheduleDraftSave({ tabId: tab.id });
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>

                      {/* Toolbars (fora do overflow-hidden) */}
                      {(() => {
                        const activeEditor = editorRefs.current[activeCanvasTab] as Editor2DHandle | undefined;
                        const effectBrushActive = !!activeEditor?.isEffectBrushActive?.();
                        const effectLassoActive = !!activeEditor?.isEffectLassoActive?.();
                        const colorCutActive = colorCutModeActive || !!activeEditor?.isColorCutActive?.();
                        const showToolConfirm = cropModeActive || effectBrushActive || effectLassoActive || colorCutActive;
                        if (!showToolConfirm) return null;
                        return (
                          <div className="absolute left-1/2 bottom-6 z-50 max-w-[95vw] -translate-x-1/2">
                            <div
                              className={[
                                "relative",
                                "flex items-center gap-2 p-2 rounded-2xl border shadow-lg bg-background",
                                "backdrop-blur supports-[backdrop-filter]:bg-background/90",
                              ].join(" ")}
                              role="toolbar"
                              aria-label={cropModeActive ? "Corte" : (colorCutActive ? "Corte por cor" : (effectBrushActive ? "Efeito (Pincel)" : "Efeito (Laço)"))}
                            >
                              <Button
                                type="button"
                                size="icon"
                                onClick={() =>
                                  cropModeActive
                                    ? editorRefs.current[activeCanvasTab]?.confirmCrop?.()
                                    : (colorCutActive
                                      ? editorRefs.current[activeCanvasTab]?.confirmColorCut?.()
                                      : (effectLassoActive
                                        ? editorRefs.current[activeCanvasTab]?.confirmEffectLasso?.()
                                        : editorRefs.current[activeCanvasTab]?.confirmEffectBrush?.()))
                                }
                                title="Confirmar (Enter)"
                              >
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() =>
                                  cropModeActive
                                    ? editorRefs.current[activeCanvasTab]?.cancelCrop?.()
                                    : (colorCutActive
                                      ? editorRefs.current[activeCanvasTab]?.cancelColorCut?.()
                                      : (effectLassoActive
                                        ? editorRefs.current[activeCanvasTab]?.cancelEffectLasso?.()
                                        : editorRefs.current[activeCanvasTab]?.cancelEffectBrush?.()))
                                }
                                title="Cancelar (Esc)"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        );
                      })()}

                      {(() => {
                        const activeEditor = editorRefs.current[activeCanvasTab] as Editor2DHandle | undefined;
                        const effectBrushActive = !!activeEditor?.isEffectBrushActive?.();
                        const effectLassoActive = !!activeEditor?.isEffectLassoActive?.();
                        const effectToolActive = effectBrushActive || effectLassoActive;
                        const colorCutActive = colorCutModeActive || !!activeEditor?.isColorCutActive?.();
                        return (!cropModeActive && !effectToolActive && !effectsEditModeActive && !colorCutActive && selectionKind === "text");
                      })() && (
                          <div className="absolute left-1/2 bottom-6 z-50 max-w-[95vw] -translate-x-1/2">
                            <div className={isToolbarTransitioning ? (toolbarTransitionType === "in" ? "flip-in" : "flip-out") : ""}>
                              <TextToolbar
                                editor={{ current: editorRefs.current[activeCanvasTab] as Editor2DHandle }}
                                visible={activeIs2D && selectionKind === "text"}
                                position="inline"
                              />
                            </div>
                          </div>
                        )}

                      {(() => {
                        const activeEditor = editorRefs.current[activeCanvasTab] as Editor2DHandle | undefined;
                        const effectBrushActive = !!activeEditor?.isEffectBrushActive?.();
                        const effectLassoActive = !!activeEditor?.isEffectLassoActive?.();
                        const effectToolActive = effectBrushActive || effectLassoActive;
                        const colorCutActive = colorCutModeActive || !!activeEditor?.isColorCutActive?.();
                        return (!cropModeActive && !effectToolActive && !colorCutActive && (effectsEditModeActive || selectionKind === "image"));
                      })() && (
                          <div className="absolute left-1/2 bottom-6 z-50 max-w-[95vw] -translate-x-1/2">
                            <div className={isToolbarTransitioning ? (toolbarTransitionType === "in" ? "flip-in" : "flip-out") : ""}>
                              <ImageToolbar
                                editor={{ current: editorRefs.current[activeCanvasTab] as Editor2DHandle }}
                                visible={activeIs2D && (effectsEditModeActive || selectionKind === "image")}
                                position="inline"
                                onBgRemoveLoadingChange={(loading) => setBgRemovingTabId(loading ? activeCanvasTab : null)}
                              />
                            </div>
                          </div>
                        )}

                      {(() => {
                        const activeEditor = editorRefs.current[activeCanvasTab] as Editor2DHandle | undefined;
                        const effectBrushActive = !!activeEditor?.isEffectBrushActive?.();
                        const effectLassoActive = !!activeEditor?.isEffectLassoActive?.();
                        const effectToolActive = effectBrushActive || effectLassoActive;
                        const colorCutActive = colorCutModeActive || !!activeEditor?.isColorCutActive?.();
                        return (!cropModeActive && !effectToolActive && !effectsEditModeActive && !colorCutActive && selectionKind !== "text" && selectionKind !== "image");
                      })() && (
                          <div className="absolute left-1/2 bottom-6 z-50 max-w-[95vw] -translate-x-1/2">
                            <div className={isToolbarTransitioning ? (toolbarTransitionType === "in" ? "flip-in" : "flip-out") : ""}>
                              <FloatingEditorToolbar
                                strokeColor={strokeColor}
                                setStrokeColor={setStrokeColor}
                                stampColor={stampColor}
                                setStampColor={setStampColor}
                                stampDensity={stampDensity}
                                setStampDensity={setStampDensity}
                                strokeWidth={strokeWidth}
                                setStrokeWidth={setStrokeWidth}
                                opacity={opacity}
                                setOpacity={setOpacity}
                                tool={tool}
                                setTool={setTool}
                                isTrashMode={isTrashMode}
                                setTrashMode={setTrashMode}
                                selectionKind={selectionKind}
                                editor2DRef={editorRefs.current[activeCanvasTab] as Editor2DHandle}
                                onUndo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.undo?.() : undefined}
                                onRedo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.redo?.() : undefined}
                                canUndo={canUndo}
                                canRedo={canRedo}
                                onApplyGradient={(gradient) => editorRefs.current[activeCanvasTab]?.applyGradientToSelection?.(gradient)}
                              />
                            </div>
                          </div>
                        )}

                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuItem
                      disabled={!selectionInfo?.hasSelection}
                      onSelect={() => runWithActiveEditor((inst) => inst.copySelection?.())}
                    >
                      Copiar
                      <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!selectionInfo?.hasClipboard}
                      onSelect={() => runWithActiveEditor((inst) => inst.pasteSelection?.())}
                    >
                      Colar
                      <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!selectionInfo?.hasSelection}
                      onSelect={() => runWithActiveEditor((inst) => inst.duplicateSelection?.())}
                    >
                      Duplicar
                      <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuItem
                      disabled={!selectionInfo?.hasSelection || selectionKind !== "image" || !canSaveSelectedImage}
                      onSelect={() => void saveSelectedImage()}
                    >
                      Salvar
                    </ContextMenuItem>

                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={!selectionInfo?.hasSelection}
                      onSelect={() => runWithActiveEditor((inst) => inst.toggleLockSelection?.())}
                    >
                      {selectionInfo?.isFullyLocked ? "Desbloquear" : "Bloquear"}
                      <ContextMenuShortcut>Shift+Ctrl+L</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={!selectionInfo?.canBringForward}
                      onSelect={() => runWithActiveEditor((inst) => inst.bringSelectionForward?.())}
                    >
                      Mover para frente
                      <ContextMenuShortcut>Ctrl+]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!selectionInfo?.canSendBackward}
                      onSelect={() => runWithActiveEditor((inst) => inst.sendSelectionBackward?.())}
                    >
                      Mover para trás
                      <ContextMenuShortcut>Ctrl+[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!selectionInfo?.canBringToFront}
                      onSelect={() => runWithActiveEditor((inst) => inst.bringSelectionToFront?.())}
                    >
                      Trazer para frente
                      <ContextMenuShortcut>]</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={!selectionInfo?.canSendToBack}
                      onSelect={() => runWithActiveEditor((inst) => inst.sendSelectionToBack?.())}
                    >
                      Enviar para trás
                      <ContextMenuShortcut>[</ContextMenuShortcut>
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      disabled={!selectionInfo?.canGroup}
                      onSelect={() => runWithActiveEditor((inst) => inst.groupSelection?.())}
                    >
                      Agrupar
                      <ContextMenuShortcut>Ctrl+G</ContextMenuShortcut>
                    </ContextMenuItem>

                    <ContextMenuSeparator />

                    <ContextMenuSub>
                      <ContextMenuSubTrigger disabled={!selectionInfo?.canApplyPattern}>
                        Padrões
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="w-80">
                        <PatternSubmenu
                          onSelectPattern={(pattern: PatternDefinition) => {
                            runWithActiveEditor((inst) => {
                              inst.previewPatternEnd?.();
                              inst.applyPatternToSelection?.(
                                pattern.source,
                                pattern.repeat,
                                pattern.defaultScale ?? 0.5
                              );
                            }
                            );
                          }}
                          onPreviewStart={(pattern: PatternDefinition) => {
                            runWithActiveEditor((inst) =>
                              inst.previewPatternStart?.(
                                pattern.source,
                                pattern.repeat,
                                pattern.defaultScale ?? 0.5
                              )
                            );
                          }}
                          onPreviewEnd={() => {
                            runWithActiveEditor((inst) => inst.previewPatternEnd?.());
                          }}
                        />
                      </ContextMenuSubContent>
                    </ContextMenuSub>

                    <ContextMenuItem
                      disabled={!selectionInfo?.hasPattern}
                      onSelect={() =>
                        runWithActiveEditor((inst) => {
                          inst.previewPatternEnd?.();
                          inst.removePatternFromSelection?.();
                        })
                      }
                    >
                      Remover padrão
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </div>
            </div>

            {/* botões removidos */}
          </div>
        </section>
      </main>
    </div >
  );
};

export default Creation;
