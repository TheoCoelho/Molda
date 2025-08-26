import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import TShirt3D from "@/components/TShirt3D";
import ExpandableSidebar from "@/components/ExpandableSidebar";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

type CanvasTab = { id: string; name: string; type: "2d" | "3d" };

const Creation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const part = searchParams.get("part");
  const type = searchParams.get("type");
  const subtype = searchParams.get("subtype");

  const [projectName, setProjectName] = useState("");
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [size, setSize] = useState("M");
  const [fabric, setFabric] = useState("algodao");

  const [canvasTabs, setCanvasTabs] = useState<CanvasTab[]>([
    { id: "3d", name: "3D", type: "3d" },
  ]);
  const [activeCanvasTab, setActiveCanvasTab] = useState("3d");
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const addNewCanvasTab = () => {
    const newTabId = `2d-${Date.now()}`;
    const newTab: CanvasTab = {
      id: newTabId,
      name: `2D - ${canvasTabs.filter((t) => t.type === "2d").length + 1}`,
      type: "2d",
    };
    setCanvasTabs((prev) => [...prev, newTab]);
    setActiveCanvasTab(newTabId);
  };

  const removeCanvasTab = (tabId: string) => {
    if (tabId === "3d") return; // não remover a 3D
    const updated = canvasTabs.filter((t) => t.id !== tabId);
    setCanvasTabs(updated);
    if (activeCanvasTab === tabId) setActiveCanvasTab(updated[0]?.id || "3d");
  };

  const handleFinalize = () => {
    const projectData = {
      part,
      type,
      subtype,
      projectName,
      baseColor,
      size,
      fabric,
    };
    localStorage.setItem("currentProject", JSON.stringify(projectData));
    navigate("/finalize");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      {/* espaçamento uniforme da página e entre os blocos */}
      <main className="pt-20 pb-6 px-6 flex min-h-screen items-stretch gap-6">
        {/* Sidebar (expansão notifica o pai, para ajustes de layout se preciso) */}
        <ExpandableSidebar
          projectName={projectName}
          setProjectName={setProjectName}
          baseColor={baseColor}
          setBaseColor={setBaseColor}
          size={size}
          setSize={setSize}
          fabric={fabric}
          setFabric={setFabric}
          onExpandChange={setIsSidebarExpanded}
        />

        {/* Container principal (altura e margens casadas com a sidebar) */}
        <section className="flex-1 my-6">
          <div className="bg-white rounded-2xl shadow-lg h-[calc(100vh-5rem-3rem)] flex flex-col">
            <div className="p-6 border-b">
              <h2 className="text-2xl font-bold text-gray-800">
                {type} - {subtype}
              </h2>
              <p className="text-gray-600">Personalize sua peça como desejar</p>
            </div>

            {/* Tabs 2D/3D */}
            <div className="px-6 pt-4">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-1 bg-gray-100 p-1 rounded-lg overflow-x-auto">
                  {canvasTabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors ${
                        activeCanvasTab === tab.id
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-600 hover:text-gray-900 hover:bg-gray-200"
                      }`}
                      onClick={() => setActiveCanvasTab(tab.id)}
                    >
                      <span className="text-sm font-medium whitespace-nowrap">
                        {tab.name}
                      </span>
                      {tab.id !== "3d" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCanvasTab(tab.id);
                          }}
                          className="ml-1 text-gray-400 hover:text-gray-600"
                          aria-label={`Fechar ${tab.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={addNewCanvasTab}
                  className="flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">Nova Tab 2D</span>
                </Button>
              </div>
            </div>

            {/* Área de edição */}
            <div className="flex-1 p-6">
              <div className="relative w-full h-[520px] bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl overflow-hidden">
                {activeCanvasTab === "3d" ? (
                  <>
                    <div className="w-full h-full min-h-[500px]">
                      <TShirt3D color={baseColor} />
                    </div>

                    <div className="absolute bottom-4 left-4 bg-white px-3 py-2 rounded-lg shadow-md">
                      <div className="text-sm font-medium text-gray-700">
                        {type} - {subtype}
                      </div>
                      <div className="text-xs text-gray-500">
                        Clique e arraste para rotacionar • Scroll para zoom
                      </div>
                    </div>

                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <Button size="sm" variant="outline" className="bg-white">
                        Reset
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-full h-full min-h-[500px] bg-white rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                      <div className="text-center text-gray-500">
                        <div className="text-2xl font-bold mb-2">Canvas 2D</div>
                        <div className="text-sm">
                          {canvasTabs.find((t) => t.id === activeCanvasTab)?.name}
                        </div>
                        <div className="text-xs mt-2">Área para desenho e edição 2D</div>
                      </div>
                    </div>

                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <Button size="sm" variant="outline" className="bg-white">
                        Limpar
                      </Button>
                      <Button size="sm" variant="outline" className="bg-white">
                        Exportar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Rodapé */}
            <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
              <div className="flex justify-between items-center">
                <Button variant="outline" onClick={() => navigate("/create")}>
                  Voltar
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline">Salvar Rascunho</Button>
                  <Button
                    onClick={handleFinalize}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                  >
                    Finalizar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Creation;
