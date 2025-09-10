import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "../components/Header";
import Canvas3DViewer from "../components/Canvas3DViewer";
import ExpandableSidebar from "../components/ExpandableSidebar";
import { Button } from "../components/ui/button";
import { Plus, X } from "lucide-react";
import Editor2D, {
  Editor2DHandle,
  Tool,
  BrushVariant,
  ShapeKind,
} from "../components/Editor2D";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };

const Creation = () => {
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

  // Ferramentas (controladas pela sidebar Pincel)
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

  // ====== snapshots por aba (JSON Fabric ou PNG fallback) ======
  const [tabSnapshots, setTabSnapshots] = useState<Record<string, string>>({});

  const saveActiveTabSnapshot = () => {
    if (!activeIs2D) return;
    const inst = editorRefs.current[activeCanvasTab];
    const json = inst?.toJSON?.();
    if (json) {
      setTabSnapshots((s) => ({ ...s, [activeCanvasTab]: json }));
    }
  };

  // Quando ativar uma aba 2D, restaura seu snapshot (se existir).
  // Usamos requestAnimationFrame para garantir que a ref já foi atribuída após o mount.
  useEffect(() => {
    if (!activeIs2D) return;
    const snap = tabSnapshots[activeCanvasTab];
    if (!snap) return;

    const restore = () => {
      const inst = editorRefs.current[activeCanvasTab];
      if (inst?.loadFromJSON) {
        inst.loadFromJSON(snap).catch(() => {});
      } else {
        // tenta novamente no próximo frame se a ref ainda não estiver pronta
        requestAnimationFrame(restore);
      }
    };
    requestAnimationFrame(restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCanvasTab, activeIs2D]);

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
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-6">
        <section className="grid grid-cols-[auto,1fr] gap-6 h-[calc(100vh-140px)] min-h-[700px]">
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
            /* ======= Somente a área "Pincel" usa estes props ======= */
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
          />

          <div className="flex flex-col h-full space-y-4">
            <div>
              <h1 className="text-2xl font-semibold">Criação</h1>
              <p className="text-sm text-gray-600">
                Parte: <span className="font-medium">{part || "-"}</span> · Tipo:{" "}
                <span className="font-medium">{type || "-"}</span> · Subtipo:{" "}
                <span className="font-medium">{subtype || "-"}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              {canvasTabs.map((tab) => {
                const active = tab.id === activeCanvasTab;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      // salva o estado da aba atual antes de trocar
                      saveActiveTabSnapshot();
                      setActiveCanvasTab(tab.id);
                    }}
                    className={`px-3 py-2 rounded-md border text-sm ${
                      active ? "bg-white shadow-sm border-gray-300" : "bg-gray-100 border-transparent"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {tab.name}
                      {tab.type === "2d" && (
                        <X
                          className="w-4 h-4 text-gray-400 hover:text-gray-700"
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
              <Button onClick={add2DTab} className="ml-2" size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Nova Tab 2D
              </Button>
            </div>

            <div className="relative w-full flex-1 min-h-[520px] bg-white/70 border rounded-xl overflow-hidden">
              {activeCanvasTab === "3d" ? (
                <div className="w-full h-full relative">
                  <Canvas3DViewer baseColor={baseColor} />
                  <div className="absolute bottom-3 left-3 text-xs text-gray-600 bg-white/80 px-2 py-1 rounded">
                    Arraste para rotacionar · Scroll para zoom
                  </div>
                </div>
              ) : (
                <div className="w-full h-full relative">
                  <Editor2D
                    key={activeCanvasTab}
                    ref={(inst) => {
                      editorRefs.current[activeCanvasTab] = inst;
                    }}
                    tool={tool}
                    brushVariant={brushVariant}
                    strokeColor={strokeColor}
                    fillColor={fillColor}
                    strokeWidth={strokeWidth}
                    opacity={opacity}
                    lineMode={lineMode}
                  />

                  <div className="absolute bottom-3 left-3 flex gap-2">
                    <button
                      onClick={clearActive}
                      className="px-3 py-2 text-sm rounded-md bg-white border hover:bg-gray-50"
                    >
                      Limpar
                    </button>
                    <button
                      onClick={exportActive}
                      className="px-3 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-black"
                    >
                      Exportar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => navigate(-1)}>
                Voltar
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={saveDraft}>
                  Salvar rascunho
                </Button>
                <Button onClick={finish}>Finalizar</Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Creation;
