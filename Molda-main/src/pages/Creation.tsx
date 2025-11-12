import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import Header from "../components/Header";
import Canvas3DViewer from "../components/Canvas3DViewer";
import ExpandableSidebar from "../components/ExpandableSidebar";
import { Button } from "../components/ui/button";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import FloatingEditorToolbar from "../components/FloatingEditorToolbar";
import TextToolbar from "../components/TextToolbar";
import { useRecentFonts } from "../hooks/use-recent-fonts";

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
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../components/ui/context-menu";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };
type SelectionKind = "none" | "text" | "other";

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9p7i/ZkAAAAASUVORK5CYII=";

const Creation = () => {
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>("Inter");
  const location = useLocation();
  const navigationState = (location.state ?? {}) as {
    startFresh?: boolean;
    restoreDraft?: boolean;
    draftId?: string;
    draftKey?: string;
    projectKey?: string;
  };
  const skipInitialLoadRef = useRef<boolean>(Boolean(navigationState.startFresh));
  const draftKeyRef = useRef<string | null>(navigationState.draftKey ?? navigationState.projectKey ?? null);
  const draftIdRef = useRef<string | null>(navigationState.draftId ?? null);

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

  const [projectName, setProjectName] = useState("Meu Projeto");
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [size, setSize] = useState("M");
  const [fabric, setFabric] = useState("Algodão");
  const [notes, setNotes] = useState("");

  const [canvasTabs, setCanvasTabs] = useState<CanvasTab[]>([
    { id: "3d", name: "3D", type: "3d" },
  ]);
  const [activeCanvasTab, setActiveCanvasTab] = useState("3d");
  const canvasTabsRef = useRef<CanvasTab[]>(canvasTabs);
  useEffect(() => {
    canvasTabsRef.current = canvasTabs;
  }, [canvasTabs]);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const [tool, setTool] = useState<Tool>("select");
  const [brushVariant, setBrushVariant] = useState<BrushVariant>("pencil");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [fillColor, setFillColor] = useState("#ffffff");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [opacity, setOpacity] = useState(1);
  const [lineMode, setLineMode] = useState<"single" | "polyline">("single");

  const editorRefs = useRef<Record<string, Editor2DHandle | null>>({});
  const lastEditorTabRef = useRef<string | null>(null);
  // Mantém refs estáveis para evitar loops com callback ref inline
  const prevEditorInstRef = useRef<Editor2DHandle | null>(null);
  const selectionListenerGuard = useRef<WeakSet<Editor2DHandle>>(new WeakSet());

  // Callback de ref estável (não depende do branch do JSX)
  const editorRefCallback = useCallback(
    (inst: Editor2DHandle | null) => {
      const currentTabId = activeCanvasTab;
      if (inst === prevEditorInstRef.current) return;

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
          } else {
            setSelectionInfo(inst.getSelectionInfo?.() ?? null);
          }
        });
        selectionListenerGuard.current.add(inst);
      }

      try {
        requestAnimationFrame(() => inst.refresh?.());
        setTimeout(() => inst.refresh?.(), 30);
      } catch {}
    },
    [activeCanvasTab]
  );
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean>>({});
  const [tabDecalPreviews, setTabDecalPreviews] = useState<Record<string, string>>({});
  const tabVisibilityRef = useRef<Record<string, boolean>>(tabVisibility);
  const tabDecalPreviewsRef = useRef<Record<string, string>>(tabDecalPreviews);
  useEffect(() => {
    tabVisibilityRef.current = tabVisibility;
  }, [tabVisibility]);
  useEffect(() => {
    tabDecalPreviewsRef.current = tabDecalPreviews;
  }, [tabDecalPreviews]);

  const captureTabImage = useCallback((tabId: string) => {
    const inst = editorRefs.current[tabId];
    const dataUrl = inst?.exportPNG?.();
    const current = tabDecalPreviewsRef.current;
    if (dataUrl && current[tabId] !== dataUrl) {
      const next = { ...current, [tabId]: dataUrl };
      tabDecalPreviewsRef.current = next;
      setTabDecalPreviews(next);
      return dataUrl;
    }
    return current[tabId] ?? null;
  }, []);

  const decalsFor3D = useMemo(() => {
    return canvasTabs
      .filter((tab) => tab.type === "2d" && tabVisibility[tab.id] && tabDecalPreviews[tab.id])
      .map((tab) => ({ id: tab.id, label: tab.name, dataUrl: tabDecalPreviews[tab.id] }));
  }, [canvasTabs, tabDecalPreviews, tabVisibility]);

  // Referência estável para os parâmetros do projeto atual
  const currentProjectRef = useRef<{part: string | null, type: string | null, subtype: string | null}>({
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
    }
    
    currentProjectRef.current = current;
  }, [part, type, subtype, resetProject]);

  const applyDraftPayload = (payload: any) => {
    if (!payload || typeof payload !== "object") return;
    if (typeof payload.projectName === "string") setProjectName(payload.projectName);
    if (typeof payload.baseColor === "string") setBaseColor(payload.baseColor);
    if (typeof payload.size === "string") setSize(payload.size);
    if (typeof payload.fabric === "string") setFabric(payload.fabric);
    if (typeof payload.notes === "string") setNotes(payload.notes);

    if (Array.isArray(payload.canvasTabs) && payload.canvasTabs.length) {
      const tabs = payload.canvasTabs as CanvasTab[];
      canvasTabsRef.current = tabs;
      setCanvasTabs(tabs);
    } else if (payload.canvasSnapshots && typeof payload.canvasSnapshots === "object") {
      const keys = Object.keys(payload.canvasSnapshots as Record<string, unknown>);
      if (keys.length) {
        const tabs: CanvasTab[] = [{ id: "3d", name: "3D", type: "3d" }];
        keys.forEach((k, i) => tabs.push({ id: k, name: `2D - ${i + 1}`, type: "2d" }));
        canvasTabsRef.current = tabs;
        setCanvasTabs(tabs);
      }
    }

    if (typeof payload.activeCanvasTab === "string") setActiveCanvasTab(payload.activeCanvasTab);
    if (payload.canvasSnapshots && typeof payload.canvasSnapshots === "object") {
      const snapshots = payload.canvasSnapshots as Record<string, string>;
      tabSnapshotsRef.current = snapshots;
      setTabSnapshots(snapshots);
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
  };

  // Carrega projeto salvo (se existir) apenas uma vez na inicialização
  useEffect(() => {
    if (skipInitialLoadRef.current) {
      draftKeyRef.current = null;
      draftIdRef.current = null;
      try {
        localStorage.removeItem("currentProject");
      } catch {}
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
          if (typeof parsed.draftId === "string") draftIdRef.current = parsed.draftId;
          else if (typeof parsed.draftId === "number") draftIdRef.current = String(parsed.draftId);
        }
      } catch {}
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
        if (typeof payload.draftId === "string") draftIdRef.current = payload.draftId;

        applyDraftPayload(payload);
        remoteApplied = true;

        try {
          localStorage.setItem("currentProject", JSON.stringify(payload));
        } catch {}
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
          if (typeof project.draftId === "string") draftIdRef.current = project.draftId;
          else if (typeof project.draftId === "number") draftIdRef.current = String(project.draftId);
        }

        const isVeryDifferentProject =
          (project.part && part && project.part !== part) ||
          (project.type && type && project.type !== type) ||
          (project.subtype && subtype && project.subtype !== subtype);
        if (isVeryDifferentProject) {
          draftKeyRef.current = null;
          draftIdRef.current = null;
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

  const activeIs2D = useMemo(
    () => canvasTabs.find((t) => t.id === activeCanvasTab)?.type === "2d",
    [canvasTabs, activeCanvasTab]
  );

  const [selectionKind, setSelectionKind] = useState<SelectionKind>("none");
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);

  const updateSelectionInfo = useCallback(() => {
    const inst = editorRefs.current[activeCanvasTab];
    if (!inst) {
      setSelectionInfo(null);
      return;
    }
    const info = inst.getSelectionInfo?.();
    setSelectionInfo(info ?? null);
  }, [activeCanvasTab]);

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
      const info = inst.getSelectionInfo?.();
      if (!info || !info.hasSelection) {
        event.preventDefault();
        setSelectionInfo(null);
        return;
      }
      setSelectionInfo(info);
    },
    [activeCanvasTab]
  );

  useEffect(() => {
    if (!activeIs2D) {
      setCanUndo(false);
      setCanRedo(false);
      setSelectionKind("none");
      setSelectionInfo(null);
      return;
    }
    updateSelectionInfo();
  }, [activeIs2D, updateSelectionInfo]);

  const [tabSnapshots, setTabSnapshots] = useState<Record<string, string>>({});
  const tabSnapshotsRef = useRef<Record<string, string>>(tabSnapshots);
  useEffect(() => {
    tabSnapshotsRef.current = tabSnapshots;
  }, [tabSnapshots]);
  const saveActiveTabSnapshot = useCallback((): Record<string, string> => {
    if (!activeIs2D) {
      captureTabImage(activeCanvasTab);
      return tabSnapshotsRef.current;
    }
    const inst = editorRefs.current[activeCanvasTab];
    const json = inst?.toJSON?.();
    if (json) {
      const next = { ...tabSnapshotsRef.current, [activeCanvasTab]: json };
      tabSnapshotsRef.current = next;
      setTabSnapshots(next);
    }
    captureTabImage(activeCanvasTab);
    return tabSnapshotsRef.current;
  }, [activeCanvasTab, activeIs2D, captureTabImage]);

  const syncFontsFromEditor = useCallback(
    (inst?: Editor2DHandle | null) => {
      const editorInstance = inst ?? editorRefs.current[activeCanvasTab];
      if (!editorInstance?.listUsedFonts) return;
      const fn = addRecentFontRef.current;
      if (!fn) return;
      try {
        const fonts = editorInstance.listUsedFonts();
        fonts.forEach((family) => fn(family));
      } catch {}
    },
    [activeCanvasTab]
  );

  useEffect(() => {
    if (!activeIs2D) return;
    const snap = tabSnapshots[activeCanvasTab];
    if (!snap) {
      syncFontsFromEditor();
      // força re-render quando não há snapshot: aguarda instância ficar pronta e chama refresh algumas vezes
      const tryRefresh = () => {
        const inst = editorRefs.current[activeCanvasTab];
        if (!inst) { requestAnimationFrame(tryRefresh); return; }
        inst.refresh?.();
        setTimeout(() => inst.refresh?.(), 60);
      };
      requestAnimationFrame(tryRefresh);
      return;
    }
    const restore = () => {
      const inst = editorRefs.current[activeCanvasTab];
      if (inst?.loadFromJSON)
        inst
          .loadFromJSON(snap)
          .then(() => {
            syncFontsFromEditor(inst);
            // após restaurar, garantir render/offset atualizados
            inst.refresh?.();
          })
          .catch(() => {
            // mesmo em falha, ainda força um refresh para mostrar o estado atual
            inst.refresh?.();
          });
      else requestAnimationFrame(restore);
    };
    requestAnimationFrame(restore);
  }, [activeCanvasTab, activeIs2D, tabSnapshots, syncFontsFromEditor]);

  const addText = (value?: string) => {
    if (!activeIs2D) return;
    editorRefs.current[activeCanvasTab]?.addText(value || "digite aqui", { x: undefined, y: undefined });
    editorRefs.current[activeCanvasTab]?.setActiveTextStyle({ fontFamily: selectedFontFamily });
  };

  const add2DTab = () => {
    saveActiveTabSnapshot();
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
    setTabSnapshots((s) => {
      const next = { ...s };
      delete next[tabId];
      tabSnapshotsRef.current = next;
      return next;
    });
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
    const updated = canvasTabs.filter((t) => t.id !== tabId);
    canvasTabsRef.current = updated;
    setCanvasTabs(updated);
    if (activeCanvasTab === tabId) setActiveCanvasTab("3d");
    editorRefs.current[tabId] = null;
  };

  const addShape = (shape: ShapeKind) => {
    if (!activeIs2D) return;
    editorRefs.current[activeCanvasTab]?.addShape(shape, {
      strokeColor,
      fillColor,
      strokeWidth,
      opacity,
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

  const exportActive = () => {
    if (!activeIs2D) return;
    const dataUrl = editorRefs.current[activeCanvasTab]?.exportPNG();
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${projectName || "projeto"}-${activeCanvasTab}.png`;
    a.click();
  };

  const saveDraft = () => {
    const snapshotMap = saveActiveTabSnapshot();
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
    const payload = {
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
      activeCanvasTab,
      savedAt: nowIso,
      draftKey,
      draftId: draftIdRef.current ?? undefined,
      projectKey: draftKey,
    };
    // salva localmente como fallback rápido
    try {
      localStorage.setItem("currentProject", JSON.stringify(payload));
    } catch {}

    // tenta persistir remotamente (Supabase). Tolerante a falhas.
    (async () => {
      try {
        if (!supabase) return;

        // Recupera usuário autenticado (necessário para políticas RLS)
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
          console.error("Erro ao obter usuário para salvar rascunho:", userErr);
          return;
        }
        const userId = userData?.user?.id;
        if (!userId) {
          console.warn("Usuário não autenticado: não será possível salvar rascunho remoto (RLS exige user_id).");
          return;
        }
        const item = {
          user_id: userId,
          project_key: draftKey,
          data: payload,
          updated_at: nowIso,
        } as any;

        // upsert no projeto (onConflict por user_id + project_key)
        const { data: upserted, error } = await supabase
          .from("project_drafts")
          .upsert(item, { onConflict: "user_id,project_key" })
          .select();
        if (error) {
          console.error("Falha ao salvar rascunho remoto:", error);
        } else {
          if (upserted && upserted.length) {
            const first = upserted[0] as { id?: string; project_key?: string };
            if (first?.id) draftIdRef.current = String(first.id);
            if (first?.project_key) draftKeyRef.current = first.project_key;
          }
          console.log("Rascunho salvo remotamente:", upserted);
        }
      } catch (err) {
        console.error("Erro ao persistir rascunho:", err);
      }
    })();
  };

  // Salva automaticamente quando o usuário fecha/recarga a página
  useEffect(() => {
    const onUnload = () => {
      try {
        saveDraft();
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [projectName, baseColor, size, fabric, notes, part, type, subtype, tabSnapshots, canvasTabs, tabVisibility, tabDecalPreviews, activeCanvasTab]);

  const finish = () => {
    saveDraft();
    navigate("/finalize");
  };

  return (
    <div className="min-h-screen overflow-hidden">
      <Header />

      <main className="container mx-auto px-4 py-6">
        {/* Mesma altura nas duas colunas */}
  <section className="grid [grid-template-columns:max-content_minmax(0,1fr)] items-stretch gap-x-6 gap-y-6 h-[calc(100vh-140px)] min-h-[700px] overflow-hidden">

          {/* Sidebar toma 100% da altura do grid */}
          <div className="h-full min-h-0 overflow-hidden">
            <ExpandableSidebar
              projectName={projectName}
              setProjectName={setProjectName}
              baseColor={baseColor}
              setBaseColor={setBaseColor}
              size={size}
              setSize={setSize}
              fabric={fabric}
              setFabric={setFabric}
              onExpandChange={() => {}}
              tool={tool}
              setTool={setTool}
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
              lineMode={lineMode}
              setLineMode={setLineMode}
              onImageInsert={(src, opts) => {
                console.log('[Creation onImageInsert]', { activeIs2D, activeCanvasTab, editorRef: !!editorRefs.current[activeCanvasTab] });
                if (activeIs2D) {
                  editorRefs.current[activeCanvasTab]?.addImage(src, opts);
                  return;
                }

                // Fallback: garantir uma aba 2D ativa e inserir lá
                const existing2D = canvasTabs.find((t) => t.type === "2d");
                if (existing2D) {
                  saveActiveTabSnapshot();
                  setActiveCanvasTab(existing2D.id);
                  // aguarda montagem do Editor2D
                  setTimeout(() => {
                    editorRefs.current[existing2D.id]?.addImage(src, opts);
                  }, 60);
                } else {
                  // cria nova aba 2D e agenda a inserção nela
                  const newId = `2d-${Date.now()}`;
                  const count = canvasTabs.filter((t) => t.type === "2d").length + 1;
                  saveActiveTabSnapshot();
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
              addText={addText}
              applyTextStyle={async (patch) => {
                if (patch.fontFamily) {
                  setSelectedFontFamily(patch.fontFamily);
                }
                await editorRefs.current[activeCanvasTab]?.setActiveTextStyle({ ...patch, from: "font-picker" });
              }}
            />
          </div>

          {/* Coluna direita: sem cabeçalho acima do canvas para alinhar o topo */}
          <div className="flex flex-col h-full min-w-0 min-h-0">
            {/* === ÁREA DO CANVAS (preenche toda altura) === */}
            <div className="relative w-full flex-1 min-h-0 glass rounded-2xl border shadow-xl overflow-hidden min-w-0">
              <div className="absolute right-4 top-4 z-30 flex">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={saveDraft}
                >
                  Salvar rascunho
                </Button>
              </div>
              {/* Abas do canvas dentro da área */}
              <div className="absolute left-4 top-4 z-20 glass rounded-xl border p-1 shadow-md">
                <div className="flex items-center gap-1">
                  {canvasTabs.map((tab) => {
                    const active = tab.id === activeCanvasTab;
                    const visibleIn3D = !!tabVisibility[tab.id];
                    return (
                      <div
                        key={tab.id}
                        className={`flex items-center gap-1 rounded-md px-3 h-8 text-sm transition ${
                          active ? "glass-strong" : "hover:bg-white/20"
                        }`}
                      >
                        <button
                          type="button"
                          className="flex-1 h-full px-1 text-left font-medium focus:outline-none inline-flex items-center"
                          aria-pressed={active}
                          onClick={() => {
                            saveActiveTabSnapshot();
                            setActiveCanvasTab(tab.id);
                          }}
                        >
                          {tab.name}
                        </button>
                        {tab.type === "2d" && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const currentlyVisible = !!tabVisibility[tab.id];
                                if (!currentlyVisible) {
                                  const result = captureTabImage(tab.id);
                                  if (!result) {
                                    setTabDecalPreviews((prev) => {
                                      if (prev[tab.id]) return prev;
                                      const next = {
                                        ...prev,
                                        [tab.id]: TRANSPARENT_PNG,
                                      };
                                      tabDecalPreviewsRef.current = next;
                                      return next;
                                    });
                                  }
                                }
                                setTabVisibility((prev) => {
                                  const next = {
                                    ...prev,
                                    [tab.id]: !currentlyVisible,
                                  };
                                  tabVisibilityRef.current = next;
                                  return next;
                                });
                              }}
                              className="p-1 rounded-full hover:bg-white/20 transition"
                              aria-label={visibleIn3D ? "Ocultar no 3D" : "Mostrar no 3D"}
                              title={visibleIn3D ? "Ocultar no 3D" : "Mostrar no 3D"}
                            >
                              {visibleIn3D ? (
                                <Eye className="w-4 h-4" />
                              ) : (
                                <EyeOff className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCanvasTab(tab.id);
                              }}
                              className="p-1 rounded-full hover:bg-white/20 transition"
                              aria-label="Fechar aba"
                              title="Fechar aba"
                            >
                              <X className="w-4 h-4 opacity-60 hover:opacity-100" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Button onClick={add2DTab} size="icon" variant="ghost" className="h-8 w-8 ml-1">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* opcional: “chip” com part/subtype SEM deslocar o layout */}
              {(subtype || part) && (
                <div className="absolute left-4 top-14 z-10 glass rounded-lg border px-2 py-1 text-xs text-foreground/80">
                  {subtype || part}
                </div>
              )}

              {/* Canvas ocupa toda a área */}
              {activeCanvasTab === "3d" ? (
                <div className="absolute inset-0">
                  <Canvas3DViewer baseColor={baseColor} externalDecals={decalsFor3D} />
                  <div className="absolute bottom-3 left-3 text-xs text-gray-700 glass px-2 py-1 rounded">
                    Arraste para rotacionar · Scroll para zoom
                  </div>

                  <div className="absolute left-1/2 z-10" style={{ bottom: "80px", maxWidth: "95%", transform: "translateX(-50%)" }}>
                    <FloatingEditorToolbar
                      strokeColor={strokeColor}
                      setStrokeColor={setStrokeColor}
                      strokeWidth={strokeWidth}
                      setStrokeWidth={setStrokeWidth}
                      opacity={opacity}
                      setOpacity={setOpacity}
                      tool={tool}
                      setTool={setTool}
                      isTrashMode={isTrashMode}
                      setTrashMode={setTrashMode}
                      editor2DRef={editorRefs.current[activeCanvasTab] as Editor2DHandle}
                      onUndo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.undo?.() : undefined}
                      onRedo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.redo?.() : undefined}
                      canUndo={canUndo}
                      canRedo={canRedo}
                    />
                  </div>
                </div>
              ) : (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className="absolute inset-0"
                      onContextMenu={handleContextMenu}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const src = e.dataTransfer.getData("text/plain");
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const y = e.clientY - rect.top;
                        if (src && activeIs2D) {
                          editorRefs.current[activeCanvasTab]?.addImage(src, { x, y });
                        }
                      }}
                    >
                      <Editor2D
                        key={activeCanvasTab}
                        ref={editorRefCallback}
                        tool={tool}
                        brushVariant={brushVariant}
                        strokeColor={strokeColor}
                        fillColor={fillColor}
                        strokeWidth={strokeWidth}
                        opacity={opacity}
                        lineMode={lineMode}
                        isTrashMode={isTrashMode}
                        onTrashDelete={() => setTool("select")}
                        onHistoryChange={(u, r) => {
                          setCanUndo(u);
                          setCanRedo(r);
                          if (tabVisibility[activeCanvasTab]) {
                            captureTabImage(activeCanvasTab);
                          }
                        }}
                      />

                      {/* TextToolbar: dentro do canvas e centralizada */}
                      {selectionKind === "text" && (
                        <TextToolbar
                          editor={{ current: editorRefs.current[activeCanvasTab] as Editor2DHandle }}
                          visible={activeIs2D && selectionKind === "text"}
                          position="bottom"
                        />
                      )}

                      {/* Toolbar geral (fica mais abaixo) */}
                      {selectionKind !== "text" && (
                        <div className="absolute left-1/2 z-10" style={{ bottom: "80px", maxWidth: "95%", transform: "translateX(-50%)" }}>
                          <FloatingEditorToolbar
                            strokeColor={strokeColor}
                            setStrokeColor={setStrokeColor}
                            strokeWidth={strokeWidth}
                            setStrokeWidth={setStrokeWidth}
                            opacity={opacity}
                            setOpacity={setOpacity}
                            tool={tool}
                            setTool={setTool}
                            isTrashMode={isTrashMode}
                            setTrashMode={setTrashMode}
                            editor2DRef={editorRefs.current[activeCanvasTab] as Editor2DHandle}
                            onUndo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.undo?.() : undefined}
                            onRedo={activeIs2D ? () => editorRefs.current[activeCanvasTab]?.redo?.() : undefined}
                            canUndo={canUndo}
                            canRedo={canRedo}
                          />
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
                  </ContextMenuContent>
                </ContextMenu>
              )}
            </div>

            {/* botões removidos */}
          </div>
        </section>
      </main>
    </div>
  );
};

export default Creation;
