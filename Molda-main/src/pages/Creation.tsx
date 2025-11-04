import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
} from "../components/Editor2D";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };
type SelectionKind = "none" | "text" | "other";

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAukB9p7i/ZkAAAAASUVORK5CYII=";

const Creation = () => {
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>("Inter");

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
  const editorRefCallback = useCallback((inst: Editor2DHandle | null) => {
    const currentTabId = activeCanvasTab;
    // Evita reações quando a instância não mudou
    if (inst === prevEditorInstRef.current) return;

    // Unmount do anterior
    if (!inst) {
      if (lastEditorTabRef.current) {
        delete editorRefs.current[lastEditorTabRef.current];
        lastEditorTabRef.current = null;
      }
      prevEditorInstRef.current = null;
      return;
    }

    // Mount novo
    editorRefs.current[currentTabId] = inst;
    lastEditorTabRef.current = currentTabId;
    prevEditorInstRef.current = inst;

    // Listener de seleção apenas uma vez por instância
    if (!selectionListenerGuard.current.has(inst)) {
      inst.onSelectionChange?.((k) => setSelectionKind(k));
      selectionListenerGuard.current.add(inst);
    }

    // Ao montar a instância atual, força um refresh para evitar tela “vazia”
    try {
      requestAnimationFrame(() => inst.refresh?.());
      setTimeout(() => inst.refresh?.(), 30);
    } catch {}
  }, [activeCanvasTab]);
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean>>({});
  const [tabDecalPreviews, setTabDecalPreviews] = useState<Record<string, string>>({});

  const captureTabImage = useCallback(
    (tabId: string) => {
      const inst = editorRefs.current[tabId];
      const dataUrl = inst?.exportPNG?.();
      if (dataUrl && tabDecalPreviews[tabId] !== dataUrl) {
        setTabDecalPreviews((prev) => ({ ...prev, [tabId]: dataUrl }));
        return dataUrl;
      }
      return tabDecalPreviews[tabId] ?? null;
    },
    [tabDecalPreviews]
  );

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

  // Carrega projeto salvo (se existir) apenas uma vez na inicialização
  useEffect(() => {
    try {
      const stored = localStorage.getItem("currentProject");
      if (stored) {
        const project = JSON.parse(stored);
        // Verifica se é um projeto muito diferente (baseado nos parâmetros)
        const isVeryDifferentProject = 
          (project.part && part && project.part !== part) || 
          (project.type && type && project.type !== type) || 
          (project.subtype && subtype && project.subtype !== subtype);
        
        if (isVeryDifferentProject) {
          // Se é um projeto muito diferente, remove do localStorage
          localStorage.removeItem("currentProject");
        }
      }
    } catch (error) {
      console.warn('Erro ao verificar projeto salvo:', error);
      localStorage.removeItem("currentProject");
    }
  }, []); // Executa apenas uma vez na montagem

  const activeIs2D = useMemo(
    () => canvasTabs.find((t) => t.id === activeCanvasTab)?.type === "2d",
    [canvasTabs, activeCanvasTab]
  );

  useEffect(() => {
    if (!activeIs2D) {
      setCanUndo(false);
      setCanRedo(false);
      setSelectionKind("none");
    }
  }, [activeIs2D]);

  const [selectionKind, setSelectionKind] = useState<SelectionKind>("none");

  const [tabSnapshots, setTabSnapshots] = useState<Record<string, string>>({});
  const saveActiveTabSnapshot = () => {
    if (!activeIs2D) return;
    const inst = editorRefs.current[activeCanvasTab];
    const json = inst?.toJSON?.();
    if (json) setTabSnapshots((s) => ({ ...s, [activeCanvasTab]: json }));
    captureTabImage(activeCanvasTab);
  };

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
    setCanvasTabs((prev) => [...prev, { id, name: `2D - ${count}`, type: "2d" }]);
    setActiveCanvasTab(id);
    setTabVisibility((prev) => ({ ...prev, [id]: false }));
  };

  const removeCanvasTab = (tabId: string) => {
    if (tabId === "3d") return;
    setTabSnapshots((s) => {
      const next = { ...s };
      delete next[tabId];
      return next;
    });
    setTabDecalPreviews((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    setTabVisibility((prev) => {
      const next = { ...prev };
      delete next[tabId];
      return next;
    });
    const updated = canvasTabs.filter((t) => t.id !== tabId);
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
    saveActiveTabSnapshot();
    const payload = {
      projectName,
      baseColor,
      size,
      fabric,
      notes,
      part,
      type,
      subtype,
      canvasSnapshots: tabSnapshots,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("currentProject", JSON.stringify(payload));
  };

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
                const existing2D = canvasTabs.find((t) => t.type === '2d');
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
                  const count = canvasTabs.filter((t) => t.type === '2d').length + 1;
                  saveActiveTabSnapshot();
                  setCanvasTabs((prev) => [...prev, { id: newId, name: `2D - ${count}`, type: '2d' }]);
                  setActiveCanvasTab(newId);
                  setTabVisibility((prev) => ({ ...prev, [newId]: false }));
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
                                      return {
                                        ...prev,
                                        [tab.id]: TRANSPARENT_PNG,
                                      };
                                    });
                                  }
                                }
                                setTabVisibility((prev) => ({
                                  ...prev,
                                  [tab.id]: !currentlyVisible,
                                }));
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
                <div
                  className="absolute inset-0"
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
