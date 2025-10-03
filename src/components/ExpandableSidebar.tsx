import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
// + NOVO import
import UploadGallery from "../components/UploadGallery";

import {
  Settings,
  FileImage,
  Brush,
  Image,
  Scissors,
  ChevronsLeft,
  ChevronsRight,
  Shapes,
  PenLine,
  PenTool,
  ChevronDown, // seta que rotacionamos ao expandir
} from "lucide-react";

interface ExpandableSidebarProps {
  // dados do projeto já usados no app
  projectName: string;
  setProjectName: (value: string) => void;
  baseColor: string;
  setBaseColor: (value: string) => void;
  size: string;
  setSize: (value: string) => void;
  fabric: string;
  setFabric: (value: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;

  // Seção Pincel (Editor 2D)
  tool: "select" | "brush" | "line" | "curve";
  setTool: (t: "select" | "brush" | "line" | "curve") => void;
  brushVariant: "pencil" | "spray" | "marker" | "calligraphy";
  setBrushVariant: (v: "pencil" | "spray" | "marker" | "calligraphy") => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon") => void;
  is2DActive: boolean;

  // Linhas
  lineMode: "single" | "polyline";
  setLineMode: (m: "single" | "polyline") => void;
  onImageInsert?: (src: string, opts?: { x?: number; y?: number; scale?: number }) => void;
}

type Section = {
  id: "settings" | "upload" | "brush" | "image" | "cut";
  icon: any;
  label: string;
  content: JSX.Element;
};

const ExpandableSidebar = ({
  projectName,
  setProjectName,
  baseColor,
  setBaseColor,
  size,
  setSize,
  fabric,
  setFabric,
  onExpandChange,

  tool,
  setTool,
  brushVariant,
  setBrushVariant,
  strokeColor,
  setStrokeColor,
  fillColor,
  setFillColor,
  strokeWidth,
  setStrokeWidth,
  opacity,
  setOpacity,
  addShape,
  is2DActive,
  lineMode,
  setLineMode,
  onImageInsert,
}: ExpandableSidebarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<Section["id"]>("settings");

  // paleta rápida (mesma estética anterior)
  const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43"];

  // ================== CONTEÚDOS ==================
  const sections: Section[] = [
    {
      id: "settings",
      icon: Settings,
      label: "Configurações",
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Configurações</h3>

          <div>
            <Label htmlFor="project-name">Nome do Projeto</Label>
            <Input id="project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Minha criação" />
          </div>

          <div>
            <Label htmlFor="base-color">Cor base</Label>
            <div className="flex items-center gap-2">
              <Input id="base-color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} placeholder="#ffffff" />
              <input type="color" value={baseColor} onChange={(e) => setBaseColor(e.target.value)} className="h-10 w-10 p-0 border rounded" aria-label="Selecionar cor base" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="size">Tamanho</Label>
              <select id="size" className="w-full px-2 py-2 border rounded text-sm" value={size} onChange={(e) => setSize(e.target.value)}>
                <option>PP</option><option>P</option><option>M</option><option>G</option><option>GG</option>
              </select>
            </div>
            <div>
              <Label htmlFor="fabric">Tecido</Label>
              <select id="fabric" className="w-full px-2 py-2 border rounded text-sm" value={fabric} onChange={(e) => setFabric(e.target.value)}>
                <option>Algodão</option><option>Poliéster</option><option>Moletom</option><option>Dry Fit</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" placeholder="Algum detalhe importante..." value={""} onChange={() => {}} />
            <p className="text-xs text-gray-500 mt-1">(Campo livre — não conectado à lógica por enquanto)</p>
          </div>
        </div>
      ),
    },
    {
      id: "upload",
      icon: FileImage,
      label: "Upload",
  content: <UploadGallery onImageInsert={onImageInsert} />,
    },
    {
      id: "brush",
      icon: Brush,
      label: "Pincel",
      // >>>>>>>> SOMENTE AQUI os ajustes solicitados (lista com setas/accordion) <<<<<<<<
      content: (
        <BrushSectionAccordion
          is2DActive={is2DActive}
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
          lineMode={lineMode}
          setLineMode={setLineMode}
          colors={colors}
        />
      ),
    },
    {
      id: "image",
      icon: Image,
      label: "Adesivos",
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Adesivos</h3>
          <div className="text-sm text-gray-500">Em breve.</div>
        </div>
      ),
    },
    {
      id: "cut",
      icon: Scissors,
      label: "Corte",
      content: (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Corte</h3>
          <div className="text-sm text-gray-500">Em breve.</div>
        </div>
      ),
    },
  ];

  const handleIconClick = (id: Section["id"]) => {
    if (id === activeSection) setIsExpanded((prev) => !prev);
    else { setActiveSection(id); setIsExpanded(true); }
  };

  const handleToggleClick = () => setIsExpanded((e) => !e);

  useEffect(() => { onExpandChange?.(isExpanded); }, [isExpanded, onExpandChange]);

  return (
    <aside
      aria-expanded={isExpanded}
      className={`bg-white shadow-lg rounded-2xl border border-gray-200 overflow-hidden transition-all duration-300 flex shrink-0 h-[calc(100vh-140px)] ${
        isExpanded ? "w-64 md:w-72 xl:w-80" : "w-14"
      }`}
    >
      {/* Coluna de ícones (formato antigo preservado) */}
      <div className="w-14 flex flex-col bg-gray-50 border-r border-gray-200 h-full py-4">
        <div className="flex-1 flex flex-col justify-evenly items-stretch">
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleIconClick(s.id)}
                className={`mx-2 rounded-md h-10 flex items-center justify-center border ${
                  isActive ? "bg-white border-purple-300" : "bg-white border-gray-200"
                } hover:border-purple-400 transition-colors`}
                aria-label={s.label}
                aria-pressed={isActive}
                title={s.label}
              >
                <Icon className={`w-6 h-6 ${isActive ? "text-purple-600" : "text-gray-600"}`} />
              </button>
            );
          })}
        </div>

        {/* Botão recolher/expandir (formato antigo preservado) */}
        <div className="mt-auto flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={handleToggleClick}
            className="w-12 h-10 rounded-md border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center"
            title={isExpanded ? "Recolher" : "Expandir"}
            aria-label={isExpanded ? "Recolher" : "Expandir"}
          >
            {isExpanded ? <ChevronsLeft className="w-5 h-5 text-gray-600" /> : <ChevronsRight className="w-5 h-5 text-gray-600" />}
          </button>
        </div>
      </div>

      {/* Painel de conteúdo (formato antigo preservado) */}
      {isExpanded && (
        <div className="flex-1 h-full overflow-y-auto">
          <div className="p-6">{sections.find((s) => s.id === activeSection)?.content}</div>
        </div>
      )}
    </aside>
  );
};

/* ===================== ÁREA EXPANDIDA: "Pincel" (lista/accordion) ===================== */

function BrushSectionAccordion({
  is2DActive,
  tool, setTool,
  brushVariant, setBrushVariant,
  strokeColor, setStrokeColor,
  fillColor, setFillColor,
  strokeWidth, setStrokeWidth,
  opacity, setOpacity,
  addShape,
  lineMode, setLineMode,
  colors,
}: {
  is2DActive: boolean;
  tool: "select" | "brush" | "line" | "curve";
  setTool: (t: "select" | "brush" | "line" | "curve") => void;
  brushVariant: "pencil" | "spray" | "marker" | "calligraphy";
  setBrushVariant: (v: "pencil" | "spray" | "marker" | "calligraphy") => void;
  strokeColor: string; setStrokeColor: (c: string) => void;
  fillColor: string; setFillColor: (c: string) => void;
  strokeWidth: number; setStrokeWidth: (n: number) => void;
  opacity: number; setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon") => void;
  lineMode: "single" | "polyline"; setLineMode: (m: "single" | "polyline") => void;
  colors: string[];
}) {
  // estados dos acordions
  const [openFormas, setOpenFormas] = useState(false);
  const [openPincel, setOpenPincel] = useState(false);
  const [openLinhas, setOpenLinhas] = useState(false);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-gray-800 text-center">Ferramentas</h3>
      <hr className="border-gray-200" />

      {/* ITEM: Formas */}
      <AccordionItem
        icon={<Shapes className="w-4 h-4" />}
        title="Formas"
        open={openFormas}
        onToggle={() => setOpenFormas((v) => !v)}
      >
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button variant="outline" onClick={() => addShape("rect")} disabled={!is2DActive}>Retângulo</Button>
          <Button variant="outline" onClick={() => addShape("ellipse")} disabled={!is2DActive}>Círculo</Button>
          <Button variant="outline" onClick={() => addShape("triangle")} disabled={!is2DActive}>Triângulo</Button>
          <Button variant="outline" onClick={() => addShape("polygon")} disabled={!is2DActive}>Polígono</Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">Clique em uma forma para adicioná-la ao canvas.</p>
      </AccordionItem>

      {/* ITEM: Lápis */}
      <AccordionItem
        icon={<Brush className="w-4 h-4" />}
        title="Lápis"
        open={openPincel}
        onToggle={() => {
          setOpenPincel((v) => !v);
          // ao abrir, já coloca ferramenta em "brush" para feedback imediato
          if (!openPincel) setTool("brush");
        }}
      >
        {/* Ferramenta atual */}
        <div className="grid grid-cols-1 gap-2 mt-2">
          <Button variant={tool === "brush" ? "default" : "outline"} onClick={() => setTool("brush")}>Lápis</Button>
        </div>

        {/* Variações do Lápis */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Button variant={brushVariant === "pencil" ? "default" : "outline"} onClick={() => setBrushVariant("pencil")} disabled={tool !== "brush"}>Normal</Button>
          <Button variant={brushVariant === "spray" ? "default" : "outline"} onClick={() => setBrushVariant("spray")} disabled={tool !== "brush"}>Spray</Button>
          <Button variant={brushVariant === "marker" ? "default" : "outline"} onClick={() => setBrushVariant("marker")} disabled={tool !== "brush"}>Marcador</Button>
          <Button variant={brushVariant === "calligraphy" ? "default" : "outline"} onClick={() => setBrushVariant("calligraphy")} disabled={tool !== "brush"}>Caligrafia</Button>
        </div>

        {/* Controles de cor, largura e opacidade agora estão na FloatingEditorToolbar */}

        {/* Paleta rápida */}
        <div className="mt-3">
          <Label>Paleta</Label>
          <div className="grid grid-cols-6 gap-2 mt-2">
            {colors.map((c) => (
              <button
                key={c}
                className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500 transition-colors"
                style={{ backgroundColor: c }}
                onClick={() => setStrokeColor(c)}
                aria-label={`Cor ${c}`}
                title={c}
              />
            ))}
          </div>
        </div>
      </AccordionItem>

      {/* ITEM: Linhas */}
      <AccordionItem
        icon={<PenLine className="w-4 h-4" />}
        title="Linhas"
        open={openLinhas}
        onToggle={() => {
          setOpenLinhas((v) => !v);
          if (!openLinhas && tool !== "line" && tool !== "curve") {
            setTool("line"); // ao abrir, default para "line"
          }
        }}
      >
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button variant={tool === "line" ? "default" : "outline"} onClick={() => setTool("line")}>
            <PenLine className="w-4 h-4 mr-2" /> Reta
          </Button>
          <Button variant={tool === "curve" ? "default" : "outline"} onClick={() => setTool("curve")}>
            <PenTool className="w-4 h-4 mr-2" /> Curva (Bézier)
          </Button>
        </div>

        {/* Modo de linha (quando em "line") */}
        {tool === "line" && (
          <div className="space-y-2 mt-3">
            <Label>Modo de desenho</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button variant={lineMode === "single" ? "default" : "outline"} onClick={() => setLineMode("single")}>Reta única</Button>
              <Button variant={lineMode === "polyline" ? "default" : "outline"} onClick={() => setLineMode("polyline")}>Polilinha</Button>
            </div>
            {lineMode === "polyline" && (
              <p className="text-xs text-gray-500">Clique para adicionar segmentos • <strong>duplo-clique</strong> para finalizar.</p>
            )}
          </div>
        )}
      </AccordionItem>
    </div>
  );
}

/* Item visual da lista/accordion do Pincel */
function AccordionItem({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2"
        aria-expanded={open}
        aria-controls={`panel-${title}`}
        title={title}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <span className="inline-flex items-center justify-center w-6">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform ${open ? "rotate-180" : "rotate-0"}`} />
      </button>

      <div id={`panel-${title}`} className={`overflow-hidden transition-all ${open ? "max-h-[1000px] py-2" : "max-h-0"}`}>
        {open && <div className="pb-2">{children}</div>}
      </div>
    </div>
  );
}

// (somente para manter compat na seção "Configurações")
function notesPlaceholderGuard(_projectName: string) { return false; }

export default ExpandableSidebar;
