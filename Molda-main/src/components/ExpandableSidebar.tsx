import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../components/ui/dropdown-menu";
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
  Search,
  Filter,
} from "lucide-react";
// Novo ícone para a seção de ferramentas
import { Wrench } from "lucide-react";
import FontPicker from "../components/FontPicker";
import { FONT_LIBRARY } from "../fonts/library";
import { generateCreativeName } from "../lib/creativeNames";

import {
  generateBlobSvgDataUrl,
} from "../lib/shapeGenerators";
import type { BrushVariant } from "./Editor2D";

// Componentes SVG customizados para formas
const ShapeIcon = ({ 
  type, 
  fillColor, 
  strokeColor, 
  fillEnabled 
}: { 
  type: "rect" | "ellipse" | "triangle" | "polygon" | "star";
  fillColor: string;
  strokeColor: string;
  fillEnabled: boolean;
}) => {
  const size = 24;
  const center = size / 2;
  const fill = fillEnabled ? strokeColor : "none";
  const stroke = strokeColor;
  const strokeWidth = fillEnabled ? 0 : 2;

  if (type === "rect") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <rect
          x={4}
          y={4}
          width={16}
          height={16}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          rx={1}
        />
      </svg>
    );
  }

  if (type === "ellipse") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <ellipse
          cx={center}
          cy={center}
          rx={8}
          ry={6}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  if (type === "triangle") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon
          points={`${center},4 ${size - 4},${size - 4} 4,${size - 4}`}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  if (type === "polygon") {
    // Hexágono
    const points: string[] = [];
    const radius = 7;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon
          points={points.join(" ")}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  if (type === "star") {
    const points: string[] = [];
    const outerRadius = 8;
    const innerRadius = 4;
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 5);
      const r = i % 2 === 0 ? outerRadius : innerRadius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon
          points={points.join(" ")}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      </svg>
    );
  }

  return null;
};

interface ExpandableSidebarProps {
  // dados do projeto
  projectId?: string | null;
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
  tool: "select" | "brush" | "line" | "curve" | "text" | "stamp";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text" | "stamp") => void;
  stampImageSrc?: string | null;
  setStampImageSrc?: (src: string | null) => void;
  brushVariant: BrushVariant;
  setBrushVariant: (v: BrushVariant) => void;
  continuousLineEnabled: boolean;
  onContinuousLineToggle: (value: boolean) => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon" | "star", style?: { fillEnabled?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; opacity?: number }) => void;
  is2DActive: boolean;

  // Upload -> inserir imagem no canvas
  onImageInsert?: (src: string, opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }) => void;
  
  // Callback para notificar quando uma imagem for inserida
  onImageInserted?: () => void;

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
    projectId,
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
    stampImageSrc,
    setStampImageSrc,
    brushVariant,
    setBrushVariant,
  continuousLineEnabled,
  onContinuousLineToggle,
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
    onImageInsert,
    onImageInserted,
    addText,
    applyTextStyle,
    autoOpenTextPanelCounter,
  } = props;

  const [isExpanded, setIsExpanded] = useState(true);
  const [activeSection, setActiveSection] = useState<SectionId>("settings");

  useEffect(() => onExpandChange?.(isExpanded), [isExpanded, onExpandChange]);

  const handleIconClick = (id: SectionId) => {
    console.log(`[ExpandableSidebar] Changing section from ${activeSection} to ${id}, current tool: ${tool}`);
    
    if (id === activeSection) setIsExpanded((prev) => !prev);
    else {
      // Desativar ferramentas de desenho quando mudar para outras seções
      if (id !== "brush" && tool !== "select" && tool !== "text") {
        console.log(`[ExpandableSidebar] Deactivating tool ${tool} -> select (section change should reset cursor)`);
        setTool("select");
        
        // Small delay to ensure the tool change is processed by Editor2D
        setTimeout(() => {
          console.log(`[ExpandableSidebar] Tool change processed, cursor should now be default`);
        }, 100);
      }
      setActiveSection(id);
      setIsExpanded(true);
    }
  };

  return (
    <aside
      aria-expanded={isExpanded}
      className={`glass shadow-lg rounded-2xl border overflow-hidden transition-all duration-500 ease-in-out flex shrink-0 h-full min-h-0 ${
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
        <div
          className={`flex-1 min-w-0 min-h-0 max-h-full overflow-hidden flex flex-col ${
            activeSection === "brush" ? "p-0" : "p-4"
          }`}
        >
          <div className={activeSection === "brush" ? "flex h-full flex-1 min-h-0 max-h-full flex-col px-2" : "flex-1 overflow-y-auto rounded-2xl p-6"}>
            {activeSection === "settings" && (
              <SettingsContent
                projectId={projectId}
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
            {activeSection === "upload" && (
              <UploadGallery 
                onImageInsert={(src, opts) => {
                  console.log(`[ExpandableSidebar] Image inserted, current tool: ${tool}`);
                  // Desativar ferramentas de desenho quando inserir imagem
                  if (tool !== "select" && tool !== "text") {
                    console.log(`[ExpandableSidebar] Deactivating tool ${tool} -> select on image insert (this should reset cursor)`);
                    setTool("select");
                  } else {
                    console.log(`[ExpandableSidebar] Tool is already ${tool}, no need to change`);
                  }
                  
                  // Call the original onImageInsert (which adds to canvas and should trigger cancelContinuousLine)
                  onImageInsert?.(src, opts);
                  onImageInserted?.();
                }} 
              />
            )}
            {activeSection === "brush" && (
              <BrushSectionAccordion
                is2DActive={is2DActive}
                tool={tool}
                setTool={setTool}
                stampImageSrc={stampImageSrc}
                setStampImageSrc={setStampImageSrc}
                brushVariant={brushVariant}
                setBrushVariant={setBrushVariant}
                continuousLineEnabled={continuousLineEnabled}
                onContinuousLineToggle={onContinuousLineToggle}
                strokeColor={strokeColor}
                setStrokeColor={setStrokeColor}
                fillColor={fillColor}
                setFillColor={setFillColor}
                strokeWidth={strokeWidth}
                setStrokeWidth={setStrokeWidth}
                opacity={opacity}
                setOpacity={setOpacity}
                addShape={addShape}
                onImageInsert={onImageInsert}
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
  projectId?: string | null;
  projectName: string;
  setProjectName: (v: string) => void;
  baseColor: string;
  setBaseColor: (v: string) => void;
  size: string;
  setSize: (v: string) => void;
  fabric: string;
  setFabric: (v: string) => void;
}) {
  const { projectId, projectName, setProjectName, baseColor, setBaseColor, size, setSize, fabric, setFabric } = props;
  const placeholderName = generateCreativeName(projectId ?? undefined);
  return (
  <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">Configurações</h3>
      <div>
        <Label htmlFor="project-name">Nome do Projeto</Label>
        <Input id="project-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={placeholderName} />
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
  tool: "select" | "brush" | "line" | "curve" | "text" | "stamp";
  setTool: (t: "select" | "brush" | "line" | "curve" | "text" | "stamp") => void;
  stampImageSrc?: string | null;
  setStampImageSrc?: (src: string | null) => void;
  brushVariant: BrushVariant;
  setBrushVariant: (v: BrushVariant) => void;
  continuousLineEnabled: boolean;
  onContinuousLineToggle: (value: boolean) => void;
  strokeColor: string;
  setStrokeColor: (c: string) => void;
  fillColor: string;
  setFillColor: (c: string) => void;
  strokeWidth: number;
  setStrokeWidth: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  addShape: (shape: "rect" | "ellipse" | "triangle" | "polygon", style?: { fillEnabled?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; opacity?: number }) => void;
  onImageInsert?: (src: string, opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }) => void;
  addText?: (value?: string) => void;
  applyTextStyle?: (patch: any) => void;
  autoOpenTextPanelCounter?: number;
}) {
  const {
    is2DActive,
    tool,
    setTool,
    stampImageSrc,
    setStampImageSrc,
    brushVariant,
    setBrushVariant,
  continuousLineEnabled,
  onContinuousLineToggle,
    strokeColor,
    setStrokeColor,
    fillColor,
    setFillColor,
    strokeWidth,
    setStrokeWidth,
    opacity,
    setOpacity,
  addShape,
    onImageInsert,
    addText,
    applyTextStyle,
    autoOpenTextPanelCounter,
  } = props;

  type SubKey = "texto" | "formas" | "blobs" | "moldes" | "pincel" | "linhas" | null;
  const [openKey, setOpenKey] = useState<SubKey>(null);
  const [enabledKey, setEnabledKey] = useState<SubKey>(null);
  const activationDelayMs = 380;
  // Preferência de preenchimento para blobs: "solid" (usa a cor do traço) ou "transparent"
  const [blobFillMode, setBlobFillMode] = useState<"solid" | "transparent">("solid");
  
  // Estados para biblioteca unificada de formas e blobs
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "shapes" | "blobs">("all");
  // Estado para controle de preenchimento de formas
  const [shapeFillEnabled, setShapeFillEnabled] = useState(true);

  const iconToggleClasses = (active: boolean, disabled?: boolean) =>
    [
      "h-12 w-12 rounded-xl border border-white/15 bg-white/5 flex items-center justify-center transition",
      disabled ? "opacity-35 cursor-not-allowed" : "hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60",
      active ? "bg-white/20 border-white/35 shadow-[inset_0_0_12px_rgba(255,255,255,0.22)]" : "",
    ].join(" ");

  const lineToolsDisabled = !is2DActive || enabledKey !== "linhas";

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

  // Não force o retorno para "select" ao trocar de seção.
  // Mantemos a ferramenta escolhida ativa até o usuário alterá-la explicitamente.

  // Função para desativar ferramentas ativas quando necessário
  const deactivateCurrentTool = useCallback(() => {
    if (tool !== "select" && tool !== "text") {
      console.log(`[BrushSectionAccordion] Deactivating tool ${tool} -> select`);
      setEnabledKey(null);
      setTool("select");
      setOpenKey(null);
    }
  }, [tool, setTool]);

  // Expor função de desativação para uso externo
  useEffect(() => {
    // Só reseta o estado interno automaticamente se o painel aberto NÃO for formas ou blobs
    if (
      tool === "select" &&
      enabledKey &&
      openKey !== "formas" &&
      openKey !== "blobs"
    ) {
      console.log(`[BrushSectionAccordion] Tool externally changed to select, resetting internal state`);
      setEnabledKey(null);
      setOpenKey(null);
    }
  }, [tool, enabledKey, openKey]);

  const toggle = (key: Exclude<SubKey, null>) => {
    console.log(`[BrushSectionAccordion] Toggling ${key}, current openKey: ${openKey}, current tool: ${tool}`);
    
    // Normalizar "formas" e "blobs" para a mesma chave unificada
    const normalizedKey = (key === "formas" || key === "blobs") ? "formas" : key;
    const currentNormalizedKey = (openKey === "formas" || openKey === "blobs") ? "formas" : openKey;
    
    if (currentNormalizedKey === normalizedKey) {
      console.log(`[BrushSectionAccordion] Closing ${normalizedKey}, switching to select`);
      setEnabledKey(null);
      setTool("select");
      setOpenKey(null);
      return;
    }
    
    console.log(`[BrushSectionAccordion] Opening ${normalizedKey}, temporarily switching to select`);
    setEnabledKey(null);
    setTool("select");
    setOpenKey(normalizedKey);
    
    window.setTimeout(() => {
      console.log(`[BrushSectionAccordion] Activating ${normalizedKey}`);
      setEnabledKey(normalizedKey);
      if (!is2DActive) {
        console.log(`[BrushSectionAccordion] 2D not active, keeping tool as select`);
        return;
      }
      
      if (normalizedKey === "pincel") {
        console.log(`[BrushSectionAccordion] Setting tool to brush`);
        setTool("brush");
      } else if (normalizedKey === "linhas") {
        console.log(`[BrushSectionAccordion] Setting tool to line`);
        setTool("line");
      } else if (normalizedKey === "texto") {
        console.log(`[BrushSectionAccordion] Setting tool to text`);
        setTool("text");
      } else if (normalizedKey === "moldes") {
        console.log(`[BrushSectionAccordion] Setting tool to stamp`);
        setTool("stamp");
      }
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

  // Itens filtrados da biblioteca unificada
  const filteredItems = useMemo(() => {
    // Definir todos os itens da biblioteca
    const allItems: Array<{
      id: string;
      type: "shape" | "blob";
      name: string;
      keywords: string[];
      shapeKind?: "rect" | "ellipse" | "triangle" | "polygon" | "star";
      blobSeed?: number;
    }> = [
      // Formas geométricas
      { id: "shape-rect", type: "shape", name: "Quadrado", keywords: ["quadrado", "square"], shapeKind: "rect" },
      { id: "shape-ellipse", type: "shape", name: "Círculo", keywords: ["círculo", "circulo", "elipse", "ellipse", "circle"], shapeKind: "ellipse" },
      { id: "shape-triangle", type: "shape", name: "Triângulo", keywords: ["triângulo", "triangulo", "triangle"], shapeKind: "triangle" },
      { id: "shape-polygon", type: "shape", name: "Polígono", keywords: ["polígono", "poligono", "hexágono", "hexagono", "polygon", "hexagon"], shapeKind: "polygon" },
      { id: "shape-star", type: "shape", name: "Estrela", keywords: ["estrela", "star"], shapeKind: "star" },
      // Blobs orgânicos
      ...Array.from({ length: 24 }).map((_, i) => ({
        id: `blob-${i}`,
        type: "blob" as const,
        name: `Blob ${i + 1}`,
        keywords: ["blob", "orgânico", "organico", "forma", "shape", `blob ${i + 1}`],
        blobSeed: i * 131 + 17,
      })),
    ];

    // Filtrar por tipo
    let filtered = allItems;
    if (activeFilter === "shapes") {
      filtered = filtered.filter(item => item.type === "shape");
    } else if (activeFilter === "blobs") {
      filtered = filtered.filter(item => item.type === "blob");
    }

    // Filtrar por pesquisa
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.keywords.some(keyword => keyword.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [searchQuery, activeFilter]);

  return (
    <div className="flex h-full flex-1 min-h-0 max-h-full flex-col overflow-hidden">
  <div className="flex-1 min-h-0 max-h-full overflow-y-auto space-y-4 pr-2 scrollbar-soft">

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

        {/* Moldes (carimbos) */}
        <AccordionItem title="Moldes" icon={<Circle className="w-4 h-4" />} open={openKey === "moldes"} onToggle={() => toggle("moldes")}>
          <div className="mt-2">
            <div className="text-xs text-gray-600 mb-2">Selecione um molde e clique/arraste no canvas.</div>

            <div className="max-h-64 overflow-y-auto overflow-x-hidden px-1 scrollbar-soft">
              <div className="grid grid-cols-3 gap-3 justify-items-center">
                {[
                  { key: "ink-splatter", src: "/assets/stamps/ink-splatter.png", title: "Molde (imagem)" },
                  { key: "ink-splatter-2", src: "/assets/stamps/ink-splatter-2.png", title: "Molde (imagem)" },
                  { key: "ink-splatter-3", src: "/assets/stamps/ink-splatter-3.png", title: "Molde (imagem)" },
                ].map(({ key, src, title }) => {
                  const active = !!stampImageSrc && stampImageSrc === src;
                  const disabled = !is2DActive || enabledKey !== "moldes";
                  return (
                    <button
                      key={key}
                      type="button"
                      title={title}
                      className={
                        [
                          "h-14 w-14 rounded border bg-white/70 overflow-hidden grid place-items-center transition",
                          disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-white hover:shadow",
                          active ? "border-black/40 ring-2 ring-black/20" : "border-black/10",
                        ].join(" ")
                      }
                      disabled={disabled}
                      onClick={() => {
                        setStampImageSrc?.(src);
                        setTool("stamp");
                      }}
                    >
                      <img src={src} alt="" className="w-full h-full object-contain p-1" draggable={false} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </AccordionItem>

        {/* Biblioteca Unificada de Formas e Blobs */}
    <AccordionItem 
      title="Formas e Blobs" 
      icon={<Shapes className="w-4 h-4" />} 
      open={openKey === "formas" || openKey === "blobs"} 
      onToggle={() => {
        if (openKey === "formas" || openKey === "blobs") {
          toggle("formas");
          const t = window.setTimeout(() => {
            setOpenKey(null);
            setEnabledKey(null);
            window.clearTimeout(t);
          }, 0);
        } else {
          toggle("formas");
        }
      }}
    >
      {/* Barra de pesquisa com botão de filtros */}
      <div className="mt-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Pesquisar formas e blobs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`h-9 px-3 rounded-md border border-white/15 bg-white/5 flex items-center justify-center transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/60 ${
                  !is2DActive ? "opacity-35 cursor-not-allowed" : ""
                } ${activeFilter !== "all" ? "bg-white/20 border-white/35" : ""}`}
                disabled={!is2DActive}
                aria-label="Filtros"
              >
                <Filter className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuRadioGroup
                value={activeFilter}
                onValueChange={(value) => setActiveFilter(value as "all" | "shapes" | "blobs")}
              >
                <DropdownMenuRadioItem value="all" disabled={!is2DActive}>
                  Todos
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="shapes" disabled={!is2DActive}>
                  Formas
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="blobs" disabled={!is2DActive}>
                  Blobs
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Controle de preenchimento para formas */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-600">Preenchimento (formas):</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={iconToggleClasses(shapeFillEnabled, !is2DActive) + " h-8 w-auto px-2 text-xs"}
            onClick={() => setShapeFillEnabled(true)}
            disabled={!is2DActive}
            aria-pressed={shapeFillEnabled}
          >
            Preenchido
          </button>
          <button
            type="button"
            className={iconToggleClasses(!shapeFillEnabled, !is2DActive) + " h-8 w-auto px-2 text-xs"}
            onClick={() => setShapeFillEnabled(false)}
            disabled={!is2DActive}
            aria-pressed={!shapeFillEnabled}
          >
            Vazado
          </button>
        </div>
      </div>

      {/* Controle de preenchimento para blobs */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-gray-600">Preenchimento (blobs):</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={iconToggleClasses(blobFillMode === "solid", !is2DActive) + " h-8 w-auto px-2 text-xs"}
            onClick={() => setBlobFillMode("solid")}
            disabled={!is2DActive}
            aria-pressed={blobFillMode === "solid"}
          >
            Igual ao traço
          </button>
          <button
            type="button"
            className={iconToggleClasses(blobFillMode === "transparent", !is2DActive) + " h-8 w-auto px-2 text-xs"}
            onClick={() => setBlobFillMode("transparent")}
            disabled={!is2DActive}
            aria-pressed={blobFillMode === "transparent"}
          >
            Transparente
          </button>
        </div>
      </div>

      {/* Lista de itens filtrados */}
      {filteredItems.length === 0 ? (
        <div className="mt-2 text-center text-sm text-gray-500 py-4">
          Nenhum item encontrado
        </div>
      ) : (
        <div className="mt-2 max-h-64 overflow-y-auto overflow-x-hidden px-1 scrollbar-soft">
          <div className="flex flex-wrap gap-3 justify-start">
            {filteredItems.map((item) => {
              const isEnabled = is2DActive && (enabledKey === "formas" || enabledKey === "blobs");
              
              if (item.type === "shape") {
                const fillColorValue = shapeFillEnabled ? (fillColor || strokeColor || "#000000") : "none";
                const strokeColorValue = strokeColor || "#000000";

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={iconToggleClasses(false, !isEnabled)}
                    onClick={() => {
                      if (!isEnabled || !item.shapeKind) return;
                      addShape(item.shapeKind, {
                        fillEnabled: shapeFillEnabled,
                        fillColor: fillColor,
                        strokeColor: strokeColor,
                        strokeWidth: strokeWidth,
                        opacity: opacity,
                      });
                      setTool("select");
                    }}
                    disabled={!isEnabled}
                    aria-label={item.name}
                    title={item.name}
                  >
                    {item.shapeKind && (
                      <ShapeIcon
                        type={item.shapeKind}
                        fillColor={fillColorValue}
                        strokeColor={strokeColorValue}
                        fillEnabled={shapeFillEnabled}
                      />
                    )}
                  </button>
                );
              } else {
                // Blob
                const blobPreview = generateBlobSvgDataUrl({ 
                  size: 64, 
                  seed: item.blobSeed || 0, 
                  fill: (blobFillMode === "transparent" ? "none" : (strokeColor || "#000")), 
                  stroke: strokeColor || "#000" 
                });

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={iconToggleClasses(false, !isEnabled) + " group"}
                    onClick={() => {
                      if (!onImageInsert || !isEnabled || item.blobSeed === undefined) {
                        return;
                      }
                      const url = generateBlobSvgDataUrl({
                        size: 320,
                        seed: item.blobSeed,
                        fill: blobFillMode === "transparent" ? "none" : (strokeColor || "#000000"),
                        stroke: strokeColor || "#000000",
                      });
                      onImageInsert(url, {
                        scale: 0.75,
                        meta: {
                          kind: "blob",
                          seed: item.blobSeed,
                          fillMode: blobFillMode,
                          baseSize: 320,
                          strokeWidth: Math.max(1, strokeWidth || 2),
                          currentFill: blobFillMode === "transparent" ? "none" : (strokeColor || "#000000"),
                          currentStroke: strokeColor || "#000000",
                          currentStrokeWidth: strokeWidth,
                        },
                      });
                      setTool("select");
                    }}
                    disabled={!isEnabled}
                    aria-label={item.name}
                    title={item.name}
                  >
                    <div className="w-8 h-8 transition-transform group-hover:scale-110">
                      <img src={blobPreview} alt={item.name} className="w-full h-full" />
                    </div>
                  </button>
                );
              }
            })}
          </div>
        </div>
      )}
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
            className={iconToggleClasses(tool === "line", lineToolsDisabled)}
            onClick={() => !lineToolsDisabled && setTool("line")}
            disabled={lineToolsDisabled}
            aria-label="Linha reta"
            title="Linha reta"
          >
            <Minus className="w-6 h-6" />
          </button>
          <button
            type="button"
            className={iconToggleClasses(tool === "curve", lineToolsDisabled)}
            onClick={() => !lineToolsDisabled && setTool("curve")}
            disabled={lineToolsDisabled}
            aria-label="Curva Bézier"
            title="Curva Bézier"
          >
            <PenTool className="w-6 h-6" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-3 gap-4">
          <p className="text-xs text-gray-600">Modo contínuo</p>
          <label className={`line-mode-switch${lineToolsDisabled ? " line-mode-switch--disabled" : ""}`}>
            <input
              type="checkbox"
              className="line-mode-checkbox"
              disabled={lineToolsDisabled}
              checked={continuousLineEnabled}
              onChange={(evt) => {
                if (lineToolsDisabled) return;
                onContinuousLineToggle(evt.target.checked);
              }}
              aria-label="Ativar modo contínuo de linhas"
            />
            <div className="line-mode-slider" aria-hidden="true" />
          </label>
        </div>
        {openKey === "linhas" && tool === "line" && (
          <p className="text-xs text-gray-500 mt-3">
            Clique e arraste para desenhar uma reta. Use <strong>Shift</strong> para alinhar em ângulos de 45°. Ative o modo contínuo para iniciar a próxima reta a partir do ponto final anterior. Pressione <strong>Esc</strong>, <strong>Enter</strong> ou dê um duplo clique para encerrar a sequência.
          </p>
        )}
      </AccordionItem>
      </div>
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
      : "transition-all duration-500 ease-in-out opacity-100 translate-y-0 py-2 max-h-96 overflow-auto pr-1"
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
