import { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
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
  ChevronDown,
  Type,
} from "lucide-react";

// >>> Biblioteca de fontes
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

  // Upload -> inserir imagem no canvas
  onImageInsert?: (src: string, opts?: { x?: number; y?: number; scale?: number }) => void;

  // Texto (Editor2D integração)
  addText?: (value?: string) => void;
  applyTextStyle?: (patch: Partial<{
    fontFamily: string; fontSize: number; fontWeight: string | number; fontStyle: "normal" | "italic";
    textAlign: "left" | "center" | "right" | "justify"; lineHeight: number; charSpacing: number;
    underline: boolean; linethrough: boolean; fill: string; stroke: string; strokeWidth: number;
    shadow: { color: string; blur: number; offsetX: number; offsetY: number } | null;
  }>) => void;

  /** contador “pingado” pelo Editor2D quando um IText é selecionado */
  autoOpenTextPanelCounter?: number;
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

  addText,
  applyTextStyle,
  autoOpenTextPanelCounter,
}: ExpandableSidebarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<Section["id"]>("settings");

  // >>> NOVO: família ativa da caixa de texto selecionada no canvas
  const [activeFamily, setActiveFamily] = useState<string>("");

  // paleta rápida
  const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43"];

  /** Lê do getter global, se existir */
  const readFamilyFromGetter = (): string | "" => {
    try {
      const g = (window as any).__editor2d_getActiveTextStyle;
      if (typeof g === "function") {
        const style = g();
        const fam = style?.fontFamily;
        if (typeof fam === "string") return fam;
      }
    } catch {}
    return "";
  };

  /** Sincroniza imediatamente via getter e/ou dispara pedido por evento (caso o Editor2D responda por evento) */
  const syncActiveFamilyNow = () => {
    // 1) tenta ler diretamente
    const fam = readFamilyFromGetter();
    if (fam) {
      setActiveFamily((prev) => (prev !== fam ? fam : prev));
    }
    // 2) ainda assim, dispara pedido por evento (se o Editor2D responder, melhor ainda)
    try {
      window.dispatchEvent(new CustomEvent("editor2d:requestActiveTextStyle"));
    } catch {}
  };

  // abrir painel de “Pincel” quando um IText é selecionado; também sincroniza a família
  useEffect(() => {
    if (autoOpenTextPanelCounter == null) return;
    setIsExpanded(true);
    setActiveSection("brush");
    syncActiveFamilyNow();
  }, [autoOpenTextPanelCounter]);

  // quando a aba/section estiver visível, sincroniza imediatamente
  useEffect(() => {
    if (isExpanded && activeSection === "brush") {
      syncActiveFamilyNow();
    }
  }, [isExpanded, activeSection]);

  // >>> OUVINTES DE EVENTO vindos do Editor2D (qualquer mudança de seleção/estilo)
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const fam = detail.fontFamily as string | undefined;
      if (typeof fam === "string" && fam) {
        setActiveFamily((prev) => (prev !== fam ? fam : prev));
        return;
      }
      // se o evento veio sem fontFamily, tenta ler do getter
      const maybe = readFamilyFromGetter();
      if (maybe) setActiveFamily((prev) => (prev !== maybe ? maybe : prev));
    };

    window.addEventListener("editor2d:activeTextStyle", handler as EventListener);
    window.addEventListener("editor2d:selectionStyle", handler as EventListener);
    window.addEventListener("editor2d:selectionChange", handler as EventListener);
    window.addEventListener("editor2d:textEdited", handler as EventListener);

    return () => {
      window.removeEventListener("editor2d:activeTextStyle", handler as EventListener);
      window.removeEventListener("editor2d:selectionStyle", handler as EventListener);
      window.removeEventListener("editor2d:selectionChange", handler as EventListener);
      window.removeEventListener("editor2d:textEdited", handler as EventListener);
    };
  }, []);

  // >>> LOOP SUAVE (rAF) ENQUANTO A ABA BRUSH ESTIVER ABERTA
  // isso garante que mesmo sem eventos o destaque do FontPicker reflete a seleção atual
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const fam = readFamilyFromGetter();
      if (fam) setActiveFamily((prev) => (prev !== fam ? fam : prev));
      raf = window.requestAnimationFrame(tick);
    };
    if (isExpanded && activeSection === "brush") {
      raf = window.requestAnimationFrame(tick);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isExpanded, activeSection]);

  // também tentamos sincronizar em interações comuns
  useEffect(() => {
    const trySync = () => {
      if (isExpanded && activeSection === "brush") syncActiveFamilyNow();
    };
    window.addEventListener("pointerup", trySync);
    window.addEventListener("keyup", trySync);
    return () => {
      window.removeEventListener("pointerup", trySync);
      window.removeEventListener("keyup", trySync);
    };
  }, [isExpanded, activeSection]);

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
              <input
                type="color"
                value={baseColor}
                onChange={(e) => setBaseColor(e.target.value)}
                className="h-10 w-10 p-0 border rounded"
                aria-label="Selecionar cor base"
              />
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
          // Texto
          addText={addText}
          applyTextStyle={applyTextStyle}
          autoOpenTextPanelCounter={autoOpenTextPanelCounter}
          // >>> sincronização de fonte
          activeFamily={activeFamily}
          setActiveFamily={setActiveFamily}
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
  className={`glass shadow-lg rounded-2xl border overflow-visible transition-all duration-300 flex shrink-0 h-full min-h-0 ${
    isExpanded ? "w-64 md:w-72 xl:w-80" : "w-14"
  }`}
    >
      {/* Coluna de ícones */}
<div className="w-14 flex flex-col bg-transparent border-r border-gray-200 h-full pt-4 pb-0">

<div className="flex-1 flex flex-col items-stretch justify-evenly gap-2">
  {sections.map((s) => {
    const Icon = s.icon;
    const isActive = activeSection === s.id;
    return (
      <button
        key={s.id}
        type="button"
        onClick={() => handleIconClick(s.id)}
        className="group mx-2 h-10 w-10 rounded-xl flex items-center justify-center transition
                   bg-transparent hover:bg-black/5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)]
                   hover:scale-[1.16] focus:outline-none focus-visible:outline-none"
        aria-label={s.label}
        aria-pressed={isActive}
        title={s.label}
      >
        <Icon
          className={`w-5 h-5 transition-all
            ${isActive
              ? "text-black [filter:drop-shadow(0_0_10px_rgba(0,0,0,.40))] scale-[1.30]"
              : "text-black/70 group-hover:text-black"}`}
        />
      </button>
    );
  })}
</div>



        {/* Botão recolher/expandir */}
        
      </div>

      {/* Painel de conteúdo */}
      {isExpanded && (
        (() => {
          // Detecta se a ferramenta ativa é 'brush' e o painel de texto está aberto
          const isBrush = activeSection === "brush";
          let isTextPanelOpen = false;
          // Busca o estado do painel de texto dentro do BrushSectionAccordion
          // Como não temos acesso direto, podemos usar uma abordagem baseada em classe para remover o padding
          // O AccordionItem de texto tem um wrapper especial de largura estendida
          // Então, removemos o padding lateral do painel externo apenas para brush
          const panelClass = isBrush
            ? "flex-1 min-w-0 min-h-2 p-0 overflow-y-auto"
            : "flex-1 min-w-0 min-h-0 p-4 overflow-y-auto";
          // Adiciona margem lateral pequena quando for brush
          const innerClass = isBrush ? "p-0 mx-2" : "p-6";
          return (
            <div className={panelClass}>
              <div className={innerClass}>{sections.find((s) => s.id === activeSection)?.content}</div>
            </div>
          );
        })()
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

  // Texto
  addText,
  applyTextStyle,
  autoOpenTextPanelCounter,

  // >>> sincronização de fonte
  activeFamily,
  setActiveFamily,
}: {
  is2DActive: boolean;
  tool: "select" | "brush" | "line" | "curve" | "text";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text") => void;
  brushVariant: "pencil" | "spray" | "marker" | "calligraphy";
  setBrushVariant: (v: "pencil" | "spray" | "marker" | "calligraphy") => void;
  strokeColor: string; setStrokeColor: (c: string) => void;
  fillColor: string; setFillColor: (c: string) => void;
  strokeWidth: number; setStrokeWidth: (n: number) => void;
  opacity: number; setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon") => void;
  lineMode: "single" | "polyline"; setLineMode: (m: "single" | "polyline") => void;
  colors: string[];
  addText?: (value?: string) => void;
  applyTextStyle?: (patch: Partial<{
    fontFamily: string; fontSize: number; fontWeight: string | number; fontStyle: "normal" | "italic";
    textAlign: "left" | "center" | "right" | "justify"; lineHeight: number; charSpacing: number;
    underline: boolean; linethrough: boolean; fill: string; stroke: string; strokeWidth: number;
    shadow: { color: string; blur: number; offsetX: number; offsetY: number } | null;
  }>) => void;
  autoOpenTextPanelCounter?: number;

  activeFamily: string;
  setActiveFamily: (fam: string) => void;
}) {
  const [openTexto, setOpenTexto] = useState(false);
  const [openFormas, setOpenFormas] = useState(false);
  const [openPincel, setOpenPincel] = useState(false);
  const [openLinhas, setOpenLinhas] = useState(false);

  // Quando Editor2D sinaliza seleção de texto, abrir este painel Texto
  useEffect(() => {
    if (autoOpenTextPanelCounter == null) return;
    setOpenTexto(true);
  }, [autoOpenTextPanelCounter]);

  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold text-gray-800 text-center">Ferramentas</h3>
      <hr className="border-gray-200" />

      {/* ITEM: Texto (Adicionar + Biblioteca de fontes) */}
      <AccordionItem
        icon={<Type className="w-4 h-4" />}
        title="Texto"
        open={openTexto}
        onToggle={() => setOpenTexto((v) => !v)}
      >
        <div className="grid grid-cols-1 gap-2 mt-2">
          <Button
            variant="outline"
            className="w-32 mx-auto"
            onClick={() => {
              if (addText) {
                addText("Digite aqui");
              } else {
                // fallback global já suportado no Editor2D
                window.dispatchEvent(new CustomEvent("editor2d:addCenteredText"));
              }
              setTool("select");
            }}
            disabled={!is2DActive}
          >
            Adicionar texto
          </Button>
        </div>

        <div className="mt-3 space-y-2">
<Label className="text-xs text-gray-600">Biblioteca de fontes</Label>

{/* 🚀 Wrapper de LARGURA ESTENDIDA (ultrapassa a lateral da sidebar) */}
<div
  className="
    -mx-2           /* ocupa de ponta a ponta do bloco interno */
    mr-[-1600px]     /* empurra 160px para fora à direita (ultrapassa a lateral) */
    pr-40           /* cria área clicável/visual além da borda */
    sm:mr-[-120px]  sm:pr-28
    md:mr-[-160px]  md:pr-40
    lg:mr-[-200px]  lg:pr-52
    xl:mr-[-240px]  xl:pr-60
  "
>
  <FontPicker
    fonts={FONT_LIBRARY}
    value={activeFamily || ""}
    onSelect={(family) => {
      setActiveFamily(family);
      if (applyTextStyle) applyTextStyle({ fontFamily: family });
      try {
        window.dispatchEvent(
          new CustomEvent("editor2d:fontPickedFromSidebar", { detail: { fontFamily: family } })
        );
      } catch {}
    }}
  />
</div>


        </div>
      </AccordionItem>

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
            setTool("line");
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
