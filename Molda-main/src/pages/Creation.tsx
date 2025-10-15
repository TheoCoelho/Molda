import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import Canvas3DViewer from "../components/Canvas3DViewer";
import ExpandableSidebar from "../components/ExpandableSidebar";
import { Button } from "../components/ui/button";
import { Plus, X } from "lucide-react";
import FloatingEditorToolbar from "../components/FloatingEditorToolbar";
import TextToolbar from "../components/TextToolbar";

import Editor2D, {
  Editor2DHandle,
  Tool,
  BrushVariant,
  ShapeKind,
} from "../components/Editor2D";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };
type SelectionKind = "none" | "text" | "other";

const Creation = () => {
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>("Inter");

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
  };

  useEffect(() => {
    if (!activeIs2D) return;
    const snap = tabSnapshots[activeCanvasTab];
    if (!snap) return;
    const restore = () => {
      const inst = editorRefs.current[activeCanvasTab];
      if (inst?.loadFromJSON) inst.loadFromJSON(snap).catch(() => {});
      else requestAnimationFrame(restore);
    };
    requestAnimationFrame(restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasTab, activeIs2D]);

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
  };

  const removeCanvasTab = (tabId: string) => {
    if (tabId === "3d") return;
    setTabSnapshots((s) => {
      const next = { ...s };
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
        <section className="grid [grid-template-columns:max-content_minmax(0,1fr)] items-stretch gap-x-6 gap-y-6 h-[calc(100vh-140px)] min-h-[700px]">

          {/* Sidebar toma 100% da altura do grid */}
          <div className="h-full">
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
                if (!activeIs2D) return;
                editorRefs.current[activeCanvasTab]?.addImage(src, opts);
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
                    return (
                      <button
                        key={tab.id}
                        onClick={() => {
                          saveActiveTabSnapshot();
                          setActiveCanvasTab(tab.id);
                        }}
                        className={`px-3 h-8 rounded-md text-sm transition ${
                          active ? "glass-strong" : "hover:bg-white/20"
                        }`}
                        aria-pressed={active}
                      >
                        <span className="inline-flex items-center gap-2">
                          {tab.name}
                          {tab.type === "2d" && (
                            <X
                              className="w-4 h-4 opacity-60 hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCanvasTab(tab.id);
                              }}
                            />
                          )}
                        </span>
                      </button>
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
                  <Canvas3DViewer baseColor={baseColor} />
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
                    ref={(inst) => {
                      editorRefs.current[activeCanvasTab] = inst;
                      inst?.onSelectionChange?.((k) => setSelectionKind(k));
                    }}
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
