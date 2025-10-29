import React, { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import UploadGallery from "../components/UploadGallery";
import { useRecentFonts } from "../hooks/use-recent-fonts";
import {
  Settings,
  FileImage,
  Brush,
  Image,
  Scissors,
  Shapes,
  PenLine,
  PenTool,
  ChevronDown,
  Type,
  Paintbrush,
  SprayCan,
  Pen,
  Eraser,
  Square,
  Circle,
  Triangle,
  Hexagon,
  Minus,
  LineChart,
} from "lucide-react";
// Novo ícone para a seção de ferramentas
import { Wrench } from "lucide-react";
import FontPicker from "../components/FontPicker";
import { FONT_LIBRARY } from "../fonts/library";

interface ExpandableSidebarProps {
  // dados do projeto
  projectName: string;
  setProjectName: (value: string) => void;
  baseColor: string;
  setBaseColor: (value: string) => void;
  size: string;
  setSize: (value: string) => void;
  fabric: string;
  setFabric: (value: string) => void;
  onExpandChange?: (isExpanded: boolean) => void;

  // Editor 2D
  tool: "select" | "brush" | "line" | "curve" | "text";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text") => void;
  brushVariant: "pencil" | "spray" | "eraser" | "calligraphy";
  setBrushVariant: (v: "pencil" | "spray" | "eraser" | "calligraphy") => void;
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

  // Upload -> inserir imagem no canvas
  onImageInsert?: (src: string, opts?: { x?: number; y?: number; scale?: number }) => void;

  // Texto (Editor2D integração)
  addText?: (value?: string) => void;
  applyTextStyle?: (patch: Partial<{
    fontFamily: string;
    fontSize: number;
    fontWeight: string | number;
    fontStyle: "normal" | "italic";
    textAlign: "left" | "center" | "right" | "justify";
    lineHeight: number;
    charSpacing: number;
    underline: boolean;
    linethrough: boolean;
    fill: string;
    stroke: string;
    strokeWidth: number;
    shadow: { color: string; blur: number; offsetX: number; offsetY: number } | null;
  }>) => void;

  /** contador “pingado” pelo Editor2D quando um IText é selecionado */
  autoOpenTextPanelCounter?: number;
}

type SectionId = "settings" | "upload" | "brush" | "image" | "cut";

const ExpandableSidebar: React.FC<ExpandableSidebarProps> = (props) => {
  const {
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
    addText,
    applyTextStyle,
    autoOpenTextPanelCounter,
  } = props;

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>("settings");

  useEffect(() => onExpandChange?.(isExpanded), [isExpanded, onExpandChange]);

  const handleIconClick = (id: SectionId) => {
    if (id === activeSection) setIsExpanded((prev) => !prev);
    else {
      setActiveSection(id);
      setIsExpanded(true);
    }
  };

  return (
    <aside
      aria-expanded={isExpanded}
      className={`glass shadow-lg rounded-2xl border overflow-visible transition-all duration-500 ease-in-out flex shrink-0 h-full min-h-0 ${
        isExpanded ? "w-64 md:w-72 xl:w-80" : "w-14"
      }`}
    >
      {/* Coluna de ícones */}
      <div className="w-14 flex flex-col bg-transparent border-r border-gray-200 h-full pt-4 pb-0">
        <div className="flex-1 flex flex-col items-stretch justify-evenly gap-2">
          {[
            { id: "settings", icon: Settings, label: "Configurações" },
            { id: "upload", icon: FileImage, label: "Upload" },
            // Renomeia "Pincel" para "Ferramentas" e troca o ícone
            { id: "brush", icon: Wrench, label: "Ferramentas" },
            { id: "image", icon: Image, label: "Adesivos" },
            { id: "cut", icon: Scissors, label: "Corte" },
          ].map((s) => {
            const Icon = s.icon as any;
            const isActive = activeSection === (s.id as SectionId);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleIconClick(s.id as SectionId)}
                className="group mx-2 h-10 w-10 rounded-xl flex items-center justify-center transition bg-transparent hover:bg-black/5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] hover:scale-[1.16] focus:outline-none focus-visible:outline-none"
                aria-label={s.label}
                aria-pressed={isActive}
                title={s.label}
              >
                <Icon
                  className={`w-5 h-5 transition-all ${
                    isActive
                      ? "text-black [filter:drop-shadow(0_0_10px_rgba(0,0,0,.40))] scale-[1.30]"
                      : "text-black/70 group-hover:text-black"
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Painel de conteúdo */}
      {isExpanded && (
        <div className={activeSection === "brush" ? "flex-1 min-w-0 min-h-2 p-0 overflow-y-auto" : "flex-1 min-w-0 min-h-0 p-4 overflow-y-auto"}>
          <div className={activeSection === "brush" ? "p-0 mx-2" : "p-6"}>
            {activeSection === "settings" && (
              <SettingsContent
                projectName={projectName}
                setProjectName={setProjectName}
                baseColor={baseColor}
                setBaseColor={setBaseColor}
                size={size}
                setSize={setSize}
                fabric={fabric}
                setFabric={setFabric}
              />
            )}
            {activeSection === "upload" && <UploadGallery onImageInsert={onImageInsert} />}
            {activeSection === "brush" && (
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
                addText={addText}
                applyTextStyle={applyTextStyle}
                autoOpenTextPanelCounter={autoOpenTextPanelCounter}
              />
            )}
            {activeSection === "image" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Adesivos</h3>
                <div className="text-sm text-gray-500">Em breve.</div>
              </div>
            )}
            {activeSection === "cut" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Corte</h3>
                <div className="text-sm text-gray-500">Em breve.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};

function SettingsContent(props: {
  projectName: string;
  setProjectName: (v: string) => void;
  baseColor: string;
  setBaseColor: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  fabric: string;
  setFabric: (v: string) => void;
}) {
  const { projectName, setProjectName, baseColor, setBaseColor, size, setSize, fabric, setFabric } = props;
  return (
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
            <option>PP</option>
            <option>P</option>
            <option>M</option>
            <option>G</option>
            <option>GG</option>
          </select>
        </div>
        <div>
          <Label htmlFor="fabric">Tecido</Label>
          <select id="fabric" className="w-full px-2 py-2 border rounded text-sm" value={fabric} onChange={(e) => setFabric(e.target.value)}>
            <option>Algodão</option>
            <option>Poliéster</option>
            <option>Moletom</option>
            <option>Dry Fit</option>
          </select>
        </div>
      </div>
      <div>
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" placeholder="Algum detalhe importante..." value={""} onChange={() => {}} />
        <p className="text-xs text-gray-500 mt-1">(Campo livre — não conectado à lógica por enquanto)</p>
      </div>
    </div>
  );
}

function BrushSectionAccordion(props: {
  is2DActive: boolean;
  tool: "select" | "brush" | "line" | "curve" | "text";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text") => void;
  brushVariant: "pencil" | "spray" | "eraser" | "calligraphy";
  setBrushVariant: (v: "pencil" | "spray" | "eraser" | "calligraphy") => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon") => void;
  lineMode: "single" | "polyline";
  setLineMode: (m: "single" | "polyline") => void;
  addText?: (value?: string) => void;
  applyTextStyle?: (patch: any) => void;
  autoOpenTextPanelCounter?: number;
}) {
  const {
    is2DActive,
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
    lineMode,
    setLineMode,
    addText,
    applyTextStyle,
    autoOpenTextPanelCounter,
  } = props;

  type SubKey = "texto" | "formas" | "pincel" | "linhas" | null;
  const [openKey, setOpenKey] = useState<SubKey>(null);
  const [enabledKey, setEnabledKey] = useState<SubKey>(null);
  const activationDelayMs = 380;

  const iconToggleClasses = (active: boolean, disabled?: boolean) =>
    [
      "h-12 w-12 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center transition",
      disabled ? "opacity-35 cursor-not-allowed" : "hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60",
      active ? "bg-white/20 border-white/35 shadow-[inset_0_0_12px_rgba(255,255,255,0.22)]" : "",
    ].join(" ");

  useEffect(() => {
    if (autoOpenTextPanelCounter == null) return;
    setOpenKey("texto");
    setEnabledKey(null);
    setTool("select");
    const t = window.setTimeout(() => {
      setEnabledKey("texto");
      if (is2DActive) setTool("text");
    }, activationDelayMs);
    return () => window.clearTimeout(t);
  }, [autoOpenTextPanelCounter, is2DActive, setTool]);

  useEffect(() => {
    if (openKey !== "pincel" && tool === "brush") setTool("select");
    if (openKey !== "linhas" && (tool === "line" || tool === "curve")) setTool("select");
    if (openKey !== "texto" && tool === "text") setTool("select");
  }, [openKey, tool, setTool]);

  const toggle = (key: Exclude<SubKey, null>) => {
    if (openKey === key) {
      setEnabledKey(null);
      setTool("select");
      setOpenKey(null);
      return;
    }
    setEnabledKey(null);
    setTool("select");
    setOpenKey(key);
    window.setTimeout(() => {
      setEnabledKey(key);
      if (!is2DActive) return;
      if (key === "pincel") setTool("brush");
      else if (key === "linhas") setTool("line");
      else if (key === "texto") setTool("text");
    }, activationDelayMs);
  };

  // Fontes recentes + família ativa
  const { addRecentFont } = useRecentFonts();
  const [activeFamily, setActiveFamily] = useState<string>("");
  useEffect(() => {
    const g: any = (window as any).__editor2d_getActiveTextStyle;
    try {
      if (typeof g === "function") {
        const fam = g()?.fontFamily;
        if (typeof fam === "string" && fam) setActiveFamily(fam);
      }
    } catch {}
  }, [openKey]);

  return (
    <div className="space-y-4">

      {/* Texto */}
  <AccordionItem title="Texto" icon={<Type className="w-4 h-4" />} open={openKey === "texto"} onToggle={() => toggle("texto")}>
        <div className="grid grid-cols-1 gap-2 mt-2">
          <Button
            variant="outline"
            className="w-32 mx-auto"
            onClick={() => {
              if (addText) addText("Digite aqui");
              else window.dispatchEvent(new CustomEvent("editor2d:addCenteredText"));
              setTool("select");
            }}
            disabled={!is2DActive || enabledKey !== "texto"}
          >
            Adicionar texto
          </Button>
        </div>
        <div className="mt-3 flex flex-col space-y-2">
          <Label className="text-xs text-gray-600">Biblioteca de fontes</Label>
          <div className="w-full">
            <FontPicker
              fonts={FONT_LIBRARY}
              value={activeFamily || ""}
              onSelect={(family) => {
                setActiveFamily(family);
                addRecentFont(family);
                applyTextStyle?.({ fontFamily: family });
                try {
                  window.dispatchEvent(new CustomEvent("editor2d:fontPickedFromSidebar", { detail: { fontFamily: family } }));
                } catch {}
              }}
              maxHeightClass="max-h-72"
            />
          </div>
        </div>
      </AccordionItem>

      {/* Formas */}
      <AccordionItem title="Formas" icon={<Shapes className="w-4 h-4" />} open={openKey === "formas"} onToggle={() => toggle("formas")}>
        <div className="grid grid-cols-4 gap-3 mt-2">
          <button type="button" className={iconToggleClasses(false, !is2DActive || enabledKey !== "formas")} onClick={() => addShape("rect")} disabled={!is2DActive || enabledKey !== "formas"} aria-label="Adicionar retângulo" title="Retângulo">
            <Square className="w-6 h-6" />
          </button>
          <button type="button" className={iconToggleClasses(false, !is2DActive || enabledKey !== "formas")} onClick={() => addShape("ellipse")} disabled={!is2DActive || enabledKey !== "formas"} aria-label="Adicionar círculo" title="Círculo">
            <Circle className="w-6 h-6" />
          </button>
          <button type="button" className={iconToggleClasses(false, !is2DActive || enabledKey !== "formas")} onClick={() => addShape("triangle")} disabled={!is2DActive || enabledKey !== "formas"} aria-label="Adicionar triângulo" title="Triângulo">
            <Triangle className="w-6 h-6" />
          </button>
          <button type="button" className={iconToggleClasses(false, !is2DActive || enabledKey !== "formas")} onClick={() => addShape("polygon")} disabled={!is2DActive || enabledKey !== "formas"} aria-label="Adicionar polígono" title="Polígono">
            <Hexagon className="w-6 h-6" />
          </button>
        </div>
      </AccordionItem>

      {/* Lápis */}
      <AccordionItem title="Lápis" icon={<Brush className="w-4 h-4" />} open={openKey === "pincel"} onToggle={() => toggle("pincel")}>
        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            className={iconToggleClasses(tool === "brush" && brushVariant === "pencil", !is2DActive || enabledKey !== "pincel")}
            onClick={() => {
              if (!is2DActive || enabledKey !== "pincel") return;
              setTool("brush");
              setBrushVariant("pencil");
            }}
            disabled={!is2DActive || enabledKey !== "pincel"}
            aria-label="Lápis padrão"
            title="Lápis padrão"
          >
            <Paintbrush className="w-6 h-6" />
          </button>
          <button
            type="button"
            className={iconToggleClasses(tool === "brush" && brushVariant === "spray", !is2DActive || enabledKey !== "pincel")}
            onClick={() => {
              if (!is2DActive || enabledKey !== "pincel") return;
              setTool("brush");
              setBrushVariant("spray");
            }}
            disabled={!is2DActive || enabledKey !== "pincel"}
            aria-label="Spray"
            title="Spray"
          >
            <SprayCan className="w-6 h-6" />
          </button>
          <button
            type="button"
            className={iconToggleClasses(tool === "brush" && brushVariant === "eraser", !is2DActive || enabledKey !== "pincel")}
            onClick={() => {
              if (!is2DActive || enabledKey !== "pincel") return;
              setTool("brush");
              setBrushVariant("eraser");
            }}
            disabled={!is2DActive || enabledKey !== "pincel"}
            aria-label="Borracha"
            title="Borracha"
          >
            <Eraser className="w-6 h-6" />
          </button>
          <button
            type="button"
            className={iconToggleClasses(tool === "brush" && brushVariant === "calligraphy", !is2DActive || enabledKey !== "pincel")}
            onClick={() => {
              if (!is2DActive || enabledKey !== "pincel") return;
              setTool("brush");
              setBrushVariant("calligraphy");
            }}
            disabled={!is2DActive || enabledKey !== "pincel"}
            aria-label="Caligrafia"
            title="Caligrafia"
          >
            <Pen className="w-6 h-6" />
          </button>
        </div>
      </AccordionItem>

      {/* Linhas */}
      <AccordionItem title="Linhas" icon={<PenLine className="w-4 h-4" />} open={openKey === "linhas"} onToggle={() => toggle("linhas")}>
        <div className="flex flex-wrap gap-3 mt-2">
          <button
            type="button"
            className={iconToggleClasses(tool === "line", !is2DActive || enabledKey !== "linhas")}
            onClick={() => enabledKey === "linhas" && setTool("line")}
            disabled={!is2DActive || enabledKey !== "linhas"}
            aria-label="Linha reta"
            title="Linha reta"
          >
            <Minus className="w-6 h-6" />
          </button>
          <button
            type="button"
            className={iconToggleClasses(tool === "curve", !is2DActive || enabledKey !== "linhas")}
            onClick={() => enabledKey === "linhas" && setTool("curve")}
            disabled={!is2DActive || enabledKey !== "linhas"}
            aria-label="Curva Bézier"
            title="Curva Bézier"
          >
            <PenTool className="w-6 h-6" />
          </button>
        </div>
        {openKey === "linhas" && tool === "line" && (
          <div className="space-y-2 mt-3">
            <Label>Modo de desenho</Label>
            <div className="flex gap-2">
              <button type="button" className={iconToggleClasses(lineMode === "single", false)} onClick={() => setLineMode("single")} aria-label="Segmento único" title="Segmento único">
                <Minus className="w-6 h-6" />
              </button>
              <button type="button" className={iconToggleClasses(lineMode === "polyline", false)} onClick={() => setLineMode("polyline")} aria-label="Polilinha" title="Polilinha">
                <LineChart className="w-6 h-6" />
              </button>
            </div>
            {lineMode === "polyline" && <p className="text-xs text-gray-500">Clique para adicionar segmentos • <strong>duplo-clique</strong> para finalizar.</p>}
          </div>
        )}
      </AccordionItem>
    </div>
  );
}

function AccordionItem({ icon, title, open, onToggle, children, grow }: { icon: React.ReactNode; title: string; open: boolean; onToggle: () => void; children: React.ReactNode; grow?: boolean }) {
  // Quando grow=true e open, o painel ocupa o espaço disponível (flex-1) sem empurrar a sidebar
  const wrapperCls = [
    "border-b border-gray-200",
    grow ? "flex flex-col min-h-0" : "",
  ].join(" ");

  const panelWrapperCls = open
    ? grow
      ? "flex-1 min-h-0 overflow-hidden"
      : "overflow-hidden transition-[max-height] duration-500 ease-in-out max-h-96"
    : "overflow-hidden transition-[max-height] duration-500 ease-in-out max-h-0";

  const innerCls = open
    ? grow
      ? "h-full overflow-auto"
      : "transition-all duration-500 ease-in-out opacity-100 translate-y-0 py-2"
    : "transition-all duration-500 ease-in-out opacity-0 -translate-y-1 py-0";

  return (
    <div className={wrapperCls}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between py-3" aria-expanded={open} aria-controls={`panel-${title}`} title={title}>
        <span className="flex items-center gap-3 text-base font-medium text-gray-700">
          <span className="inline-flex items-center justify-center w-6">{icon}</span>
          {title}
        </span>
        <ChevronDown className={`w-4 h-4 text-gray-600 transition-transform duration-500 ${open ? "rotate-180" : "rotate-0"}`} />
      </button>
      <div id={`panel-${title}`} className={panelWrapperCls}>
        <div className={innerCls}>{children}</div>
      </div>
    </div>
  );
}

// (somente para manter compat na seção "Configurações")
function notesPlaceholderGuard(_projectName: string) {
  return false;
}

export default ExpandableSidebar;

