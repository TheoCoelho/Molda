import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "../integrations/supabase/client";
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
  Search,
} from "lucide-react";
// Novo ícone para a seção de ferramentas
import { Wrench } from "lucide-react";
import FontPicker from "../components/FontPicker";
import { FONT_LIBRARY } from "../fonts/library";
import { generateCreativeName } from "../lib/creativeNames";

import type { BrushVariant } from "./Editor2D";

// Componentes SVG customizados para formas
type ShapeIconType = "rect" | "ellipse" | "triangle" | "polygon" | "star" | "diamond" | "pentagon" | "octagon" | "cross" | "heart" | "arrow" | "lightning" | "drop" | "moon" | "star6";

const ShapeIcon = ({
  type,
  fillColor,
  strokeColor,
  fillEnabled
}: {
  type: ShapeIconType;
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
        <rect x={4} y={4} width={16} height={16} fill={fill} stroke={stroke} strokeWidth={strokeWidth} rx={1} />
      </svg>
    );
  }

  if (type === "ellipse") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <ellipse cx={center} cy={center} rx={8} ry={6} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "triangle") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={`${center},4 ${size - 4},${size - 4} 4,${size - 4}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "polygon") {
    const points: string[] = [];
    const radius = 7;
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "star") {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 5);
      const r = i % 2 === 0 ? 8 : 4;
      points.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "diamond") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={`${center},3 ${size - 4},${center} ${center},${size - 3} 4,${center}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "pentagon") {
    const points: string[] = [];
    const radius = 8;
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 / 5) * i - Math.PI / 2;
      points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "octagon") {
    const points: string[] = [];
    const radius = 8;
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i - Math.PI / 2 + Math.PI / 8;
      points.push(`${center + radius * Math.cos(angle)},${center + radius * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "cross") {
    const a = 3, b = 9, c = 15, d = 21;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={`${b},${a} ${c},${a} ${c},${b} ${d},${b} ${d},${c} ${c},${c} ${c},${d} ${b},${d} ${b},${c} ${a},${c} ${a},${b} ${b},${b}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "heart") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <path d={`M${center},${size - 5} C${center - 8},${size - 10} ${2},${center - 1} ${2},${center - 4} C${2},${center - 8} ${center - 3},${3} ${center},${7} C${center + 3},${3} ${size - 2},${center - 8} ${size - 2},${center - 4} C${size - 2},${center - 1} ${center + 8},${size - 10} ${center},${size - 5}Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "arrow") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={`3,${center - 3} 14,${center - 3} 14,${4} ${size - 3},${center} 14,${size - 4} 14,${center + 3} 3,${center + 3}`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "lightning") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={`9,2 16,2 12,10 18,10 8,22 11,13 6,13`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "drop") {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <path d={`M${center},3 C${center - 1},7 ${4},${center + 2} ${4},${center + 5} A${center - 4} ${center - 4} 0 0 0 ${size - 4},${center + 5} C${size - 4},${center + 2} ${center + 1},7 ${center},3 Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "moon") {
    // Crescent: outer circle R=9 at (12,12), inner cutout r=7 at (8,12)
    // Intersection points at (6, 5.3) and (6, 18.7)
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <path d={`M ${center - 6},${center - 6.7} A 9 9 0 1 1 ${center - 6},${center + 6.7} A 7 7 0 0 1 ${center - 6},${center - 6.7} Z`} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      </svg>
    );
  }

  if (type === "star6") {
    const points: string[] = [];
    for (let i = 0; i < 12; i++) {
      const angle = -Math.PI / 2 + i * (Math.PI / 6);
      const r = i % 2 === 0 ? 8 : 4.5;
      points.push(`${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`);
    }
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="w-6 h-6">
        <polygon points={points.join(" ")} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
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
  fabricLocked?: boolean;
  tabPrintTypes?: Record<string, string>;
  setTabPrintType?: (tabId: string, value: string) => void;
  visibleTabs?: { id: string; name: string; type: "2d" | "3d"; dataUrl: string | null }[];
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
  addShape: (shape: ShapeIconType, style?: { fillEnabled?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; opacity?: number }) => void;
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
    fabricLocked,
    tabPrintTypes,
    setTabPrintType,
    visibleTabs,
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
      className={`glass shadow-lg rounded-2xl border overflow-hidden transition-all duration-500 ease-in-out flex shrink-0 h-full min-h-0 ${isExpanded ? "w-64 md:w-72 xl:w-80" : "w-14"
        }`}
    >
      {/* Coluna de ícones */}
      <div className="w-14 flex flex-col bg-transparent border-r border-gray-200 dark:border-border h-full pt-4 pb-0">
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
                className="group mx-2 h-10 w-10 rounded-xl flex items-center justify-center transition bg-transparent hover:bg-black/5 dark:hover:bg-white/10 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.25)] hover:scale-[1.16] focus:outline-none focus-visible:outline-none"
                aria-label={s.label}
                aria-pressed={isActive}
                title={s.label}
              >
                <Icon
                  className={`w-5 h-5 transition-all ${isActive
                    ? "text-black dark:text-white [filter:drop-shadow(0_0_10px_rgba(0,0,0,.40))] dark:[filter:drop-shadow(0_0_10px_rgba(255,255,255,.30))] scale-[1.30]"
                    : "text-black/70 dark:text-white/70 group-hover:text-black dark:group-hover:text-white"
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
          className={`flex-1 min-w-0 min-h-0 max-h-full overflow-hidden flex flex-col`}
        >
          <div className={activeSection === "brush" ? "flex h-full flex-1 min-h-0 max-h-full flex-col px-2" : "flex-1 overflow-y-auto rounded-2xl p-4 lg:p-6 pb-2"}>
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
                fabricLocked={fabricLocked}
                tabPrintTypes={tabPrintTypes}
                setTabPrintType={setTabPrintType}
                visibleTabs={visibleTabs}
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
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Adesivos</h3>
                <div className="text-sm text-gray-500 dark:text-gray-400">Em breve.</div>
              </div>
            )}
            {activeSection === "cut" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Corte</h3>
                <div className="text-sm text-gray-500 dark:text-gray-400">Em breve.</div>
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
  fabricLocked?: boolean;
  tabPrintTypes?: Record<string, string>;
  setTabPrintType?: (tabId: string, value: string) => void;
  visibleTabs?: { id: string; name: string; type: "2d" | "3d"; dataUrl: string | null }[];
}) {
  const { projectId, projectName, setProjectName, baseColor, setBaseColor, size, setSize, fabric, setFabric, fabricLocked, tabPrintTypes, setTabPrintType, visibleTabs } = props;
  const placeholderName = generateCreativeName(projectId ?? undefined);

  const [dbMaterials, setDbMaterials] = useState<{ id: string; name: string }[]>([]);
  const [dbPrintingMethods, setDbPrintingMethods] = useState<{ id: string; name: string; sort_order: number | null }[]>([]);
  const [dbMaterialPrinting, setDbMaterialPrinting] = useState<{ material_id: string; printing_method_id: string }[]>([]);

  useEffect(() => {
    (async () => {
      const [mRes, pmRes, mpmRes] = await Promise.all([
        supabase.from("materials").select("id,name").eq("is_active", true).order("name"),
        supabase.from("printing_methods").select("id,name,sort_order").eq("is_active", true).order("sort_order"),
        supabase.from("material_printing_methods").select("material_id,printing_method_id"),
      ]);
      if (!mRes.error && mRes.data) setDbMaterials(mRes.data);
      if (!pmRes.error && pmRes.data) setDbPrintingMethods(pmRes.data);
      if (!mpmRes.error && mpmRes.data) setDbMaterialPrinting(mpmRes.data);
    })();
  }, []);

    const normalizeLabel = (value: string) =>
      value
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

    const selectedMaterial =
      dbMaterials.find((m) => m.name === fabric) ??
      dbMaterials.find((m) => normalizeLabel(m.name) === normalizeLabel(fabric));

    // Quando os materiais do DB carregam, ajusta fabric para um nome canonico vindo do DB
    useEffect(() => {
      if (dbMaterials.length === 0) return;
      if (selectedMaterial) {
        if (fabric !== selectedMaterial.name) setFabric(selectedMaterial.name);
        return;
      }
      setFabric(dbMaterials[0].name);
    }, [dbMaterials, selectedMaterial, fabric, setFabric]);

    const selectedMaterialId = selectedMaterial?.id ?? "";
    const allowedMethodIds = selectedMaterial
      ? new Set(dbMaterialPrinting.filter((r) => r.material_id === selectedMaterial.id).map((r) => r.printing_method_id))
      : null;
    // Material encontrado no DB: exibe somente metodos vinculados
    // Material nao encontrado no DB: nao exibe metodos (evita liberar todos por engano)
    const allowedMethods = selectedMaterial
      ? dbPrintingMethods.filter((m) => allowedMethodIds!.has(m.id))
      : [];

    // Reseta tabPrintTypes quando fabric muda e metodos disponiveis mudam
    const allowedMethodsKey = allowedMethods.map((m) => m.id).join(",");
    const visibleTabsKey = visibleTabs?.map((t) => t.id).join(",") ?? "";
    useEffect(() => {
      if (!visibleTabs || !setTabPrintType || allowedMethods.length === 0) return;
      const allowedNames = new Set(allowedMethods.map((m) => m.name));
      visibleTabs.forEach((tab) => {
        const current = tabPrintTypes?.[tab.id] ?? "";
        if (!current || !allowedNames.has(current)) {
          setTabPrintType(tab.id, allowedMethods[0].name);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedMethodsKey, visibleTabsKey]);

    return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Configurações</h3>
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
          <select id="size" className="w-full px-2 py-2 border rounded text-sm bg-background text-foreground" value={size} onChange={(e) => setSize(e.target.value)}>
            <option>PP</option>
            <option>P</option>
            <option>M</option>
            <option>G</option>
            <option>GG</option>
          </select>
        </div>
        <div>
          <Label htmlFor="fabric">Tecido</Label>
          {fabricLocked ? (
            <div
              id="fabric"
              className="w-full px-2 py-2 border rounded text-sm bg-muted/30 text-foreground"
              aria-readonly="true"
            >
              {selectedMaterial?.name || fabric || "Tecido da peça"}
            </div>
          ) : (
            <select
              id="fabric"
              className="w-full px-2 py-2 border rounded text-sm bg-background text-foreground"
              value={dbMaterials.length > 0 ? selectedMaterialId : fabric}
              onChange={(e) => {
                const material = dbMaterials.find((m) => m.id === e.target.value);
                setFabric(material?.name ?? e.target.value);
              }}
            >
              {dbMaterials.length > 0 ? (
                dbMaterials.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))
              ) : (
                <>
                  <option>Algodão</option>
                  <option>Poliéster</option>
                  <option>Moletom</option>
                  <option>Dry Fit</option>
                </>
              )}
            </select>
          )}
        </div>
      </div>
      
      {visibleTabs && visibleTabs.length > 0 && (
        <div className="mt-6 -mx-4 lg:-mx-6">
          <h4 className="text-md font-semibold text-gray-800 dark:text-gray-100 mb-3 border-b pb-2 px-4 lg:px-6">Técnicas de Estamparia</h4>
          <div className="space-y-4 px-4 lg:px-6">
            {visibleTabs.map((tab) => (
              <div key={tab.id} className="flex items-stretch bg-gray-50 dark:bg-white/5 rounded-lg border overflow-hidden">
                {/* Preview Thumbnail */}
                <div className="w-[100px] flex-shrink-0 bg-white dark:bg-white/10 border-r p-0 overflow-hidden flex items-center justify-center">
                  {tab.dataUrl ? (
                    <img src={tab.dataUrl} alt={tab.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-gray-400 dark:text-gray-500 p-2">Sem Img</span>
                  )}
                </div>
                
                {/* Info & Select */}
                <div className="flex-1 min-w-0 p-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate mb-1.5" title={tab.name}>
                    {tab.name}
                  </p>
                  <select
                    className="w-full px-2 py-1.5 border rounded text-xs bg-white dark:bg-card text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white/30 cursor-pointer"
                    value={(() => {
                      const cur = tabPrintTypes?.[tab.id] ?? "";
                      if (allowedMethods.length === 0) return "";
                      return allowedMethods.find((m) => m.name === cur) ? cur : allowedMethods[0].name;
                    })()}
                    onChange={(e) => setTabPrintType?.(tab.id, e.target.value)}
                  >
                    {allowedMethods.length > 0 ? (
                      allowedMethods.map((m) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))
                    ) : (
                      <option value="" disabled>
                        Nenhuma técnica disponível para este tecido
                      </option>
                    )}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
  addShape: (shape: ShapeIconType, style?: { fillEnabled?: boolean; fillColor?: string; strokeColor?: string; strokeWidth?: number; opacity?: number }) => void;
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

  type SubKey = "texto" | "formas" | "moldes" | "pincel" | null;
  const [openKey, setOpenKey] = useState<SubKey>(null);
  const [enabledKey, setEnabledKey] = useState<SubKey>(null);
  const activationDelayMs = 380;

  // Estados para biblioteca de formas
  const [searchQuery, setSearchQuery] = useState("");
  // Estado para controle de preenchimento de formas
  const [shapeFillEnabled, setShapeFillEnabled] = useState(true);

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
    // Só reseta o estado interno automaticamente se o painel aberto NÃO for formas
    if (
      tool === "select" &&
      enabledKey &&
      openKey !== "formas"
    ) {
      console.log(`[BrushSectionAccordion] Tool externally changed to select, resetting internal state`);
      setEnabledKey(null);
      setOpenKey(null);
    }
  }, [tool, enabledKey, openKey]);

  const toggle = (key: Exclude<SubKey, null>) => {
    console.log(`[BrushSectionAccordion] Toggling ${key}, current openKey: ${openKey}, current tool: ${tool}`);

    const normalizedKey = key;
    const currentNormalizedKey = openKey;

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
    } catch { }
  }, [openKey]);

  // Itens filtrados da biblioteca unificada
  const filteredItems = useMemo(() => {
    // Definir todos os itens da biblioteca
    const allItems: Array<{
      id: string;
      name: string;
      keywords: string[];
      shapeKind: ShapeIconType;
    }> = [
        { id: "shape-rect", name: "Quadrado", keywords: ["quadrado", "square", "retângulo", "retangulo"], shapeKind: "rect" },
        { id: "shape-ellipse", name: "Círculo", keywords: ["círculo", "circulo", "elipse", "ellipse", "circle"], shapeKind: "ellipse" },
        { id: "shape-triangle", name: "Triângulo", keywords: ["triângulo", "triangulo", "triangle"], shapeKind: "triangle" },
        { id: "shape-polygon", name: "Hexágono", keywords: ["polígono", "poligono", "hexágono", "hexagono", "polygon", "hexagon"], shapeKind: "polygon" },
        { id: "shape-star", name: "Estrela", keywords: ["estrela", "star"], shapeKind: "star" },
        { id: "shape-diamond", name: "Losango", keywords: ["losango", "diamante", "diamond", "rhombus"], shapeKind: "diamond" },
        { id: "shape-pentagon", name: "Pentágono", keywords: ["pentágono", "pentagono", "pentagon"], shapeKind: "pentagon" },
        { id: "shape-octagon", name: "Octágono", keywords: ["octágono", "octagono", "octagon", "pare", "stop"], shapeKind: "octagon" },
        { id: "shape-cross", name: "Cruz", keywords: ["cruz", "cross", "mais", "plus"], shapeKind: "cross" },
        { id: "shape-heart", name: "Coração", keywords: ["coração", "coracao", "heart", "amor", "love"], shapeKind: "heart" },
        { id: "shape-arrow", name: "Seta", keywords: ["seta", "arrow", "direção", "direcao"], shapeKind: "arrow" },
        { id: "shape-lightning", name: "Raio", keywords: ["raio", "relâmpago", "relampago", "lightning", "bolt", "trovão"], shapeKind: "lightning" },
        { id: "shape-drop", name: "Gota", keywords: ["gota", "drop", "água", "agua", "water", "lágrima"], shapeKind: "drop" },
        { id: "shape-moon", name: "Lua", keywords: ["lua", "moon", "crescente", "crescent", "noite"], shapeKind: "moon" },
        { id: "shape-star6", name: "Estrela 6", keywords: ["estrela 6", "star 6", "hexagrama", "davi", "david"], shapeKind: "star6" },
      ];

    // Filtrar por pesquisa
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      return allItems.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.keywords.some(keyword => keyword.toLowerCase().includes(query))
      );
    }

    return allItems;
  }, [searchQuery]);

  return (
    <div className="flex h-full flex-1 min-h-0 max-h-full flex-col overflow-hidden">
      <div className="flex-1 min-h-0 max-h-full overflow-y-auto space-y-4 pr-2 scrollbar-soft">

        {/* Texto */}
        <AccordionItem title="Texto" icon={<Type className="w-4 h-4" />} open={openKey === "texto"} onToggle={() => toggle("texto")} grow>
          <div className="mt-2 flex flex-col flex-1 min-h-0 w-full">
            <FontPicker
              fonts={FONT_LIBRARY}
              value={activeFamily || ""}
              onSelect={(family) => {
                setActiveFamily(family);
                addRecentFont(family);
                applyTextStyle?.({ fontFamily: family });
                try {
                  window.dispatchEvent(new CustomEvent("editor2d:fontPickedFromSidebar", { detail: { fontFamily: family } }));
                } catch { }
              }}
              maxHeightClass="max-h-full"
            />
          </div>
        </AccordionItem>

        {/* Moldes (carimbos) */}
        <AccordionItem title="Moldes" icon={<Circle className="w-4 h-4" />} open={openKey === "moldes"} onToggle={() => toggle("moldes")}>
          <div className="mt-2">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-2">Selecione um molde e clique/arraste no canvas.</div>

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

        {/* Biblioteca de Formas */}
        <AccordionItem
          title="Formas"
          icon={<Shapes className="w-4 h-4" />}
          open={openKey === "formas"}
          onToggle={() => toggle("formas")}
        >
          {/* Barra de pesquisa */}
          <div className="mt-2 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <Input
                type="text"
                placeholder="Pesquisar formas..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
          </div>

          {/* Controle de preenchimento */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={iconToggleClasses(shapeFillEnabled, !is2DActive) + " h-9 w-auto px-2"}
                onClick={() => setShapeFillEnabled(true)}
                disabled={!is2DActive}
                aria-pressed={shapeFillEnabled}
                title="Preenchido"
              >
                <svg width="28" height="16" viewBox="0 0 28 16" className="w-7 h-4">
                  <rect x="1" y="2" width="12" height="12" rx="1" fill="currentColor" stroke="none" />
                  <circle cx="21" cy="8" r="6" fill="currentColor" stroke="none" />
                </svg>
              </button>
              <button
                type="button"
                className={iconToggleClasses(!shapeFillEnabled, !is2DActive) + " h-9 w-auto px-2"}
                onClick={() => setShapeFillEnabled(false)}
                disabled={!is2DActive}
                aria-pressed={!shapeFillEnabled}
                title="Vazado"
              >
                <svg width="28" height="16" viewBox="0 0 28 16" className="w-7 h-4">
                  <rect x="1.5" y="2.5" width="11" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <circle cx="21" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            </div>
          </div>

          {/* Lista de formas */}
          {filteredItems.length === 0 ? (
            <div className="mt-2 text-center text-sm text-gray-500 py-4">
              Nenhum item encontrado
            </div>
          ) : (
            <div className="mt-2 px-1">
              <div className="flex flex-wrap gap-3 justify-start">
                {filteredItems.map((item) => {
                  const isEnabled = is2DActive && enabledKey === "formas";
                  const fillColorValue = shapeFillEnabled ? (fillColor || strokeColor || "#000000") : "none";
                  const strokeColorValue = strokeColor || "#000000";

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={iconToggleClasses(false, !isEnabled)}
                      onClick={() => {
                        if (!isEnabled) return;
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
                      <ShapeIcon
                        type={item.shapeKind}
                        fillColor={fillColorValue}
                        strokeColor={strokeColorValue}
                        fillEnabled={shapeFillEnabled}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </AccordionItem>

        {/* Lápis */}
        <AccordionItem title="Desenho" icon={<Brush className="w-4 h-4" />} open={openKey === "pincel"} onToggle={() => toggle("pincel")}>
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
              className={iconToggleClasses(tool === "curve", !is2DActive || enabledKey !== "pincel")}
              onClick={() => {
                if (!is2DActive || enabledKey !== "pincel") return;
                setTool("curve");
              }}
              disabled={!is2DActive || enabledKey !== "pincel"}
              aria-label="Curva Bézier"
              title="Curva Bézier"
            >
              <PenTool className="w-6 h-6" />
            </button>
          </div>
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
