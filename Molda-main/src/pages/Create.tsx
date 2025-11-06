import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import LinearInfiniteCarousel from "@/components/LinearInfiniteCarousel";

type BodyPart = "head" | "torso" | "legs";

type ModelItem = {
  name: string;
  color?: string;
};

const PALETTE = [
  "#e11d48", "#f472b6", "#fb923c", "#facc15", "#84cc16",
  "#10b981", "#0ea5e9", "#3b82f6", "#8b5cf6", "#a78bfa",
  "#f43f5e", "#ec4899", "#f59e0b", "#d97706", "#22c55e",
  "#14b8a6", "#06b6d4", "#2563eb", "#7c3aed", "#9333ea",
];

const clothingTypes: Record<BodyPart, ModelItem[]> = {
  head: [{ name: "Boné" }, { name: "Touca" }, { name: "Chapéu" }],
  torso: [{ name: "Camiseta" }, { name: "Camisa" }, { name: "Jaqueta" }, { name: "Moletom" }],
  legs: [{ name: "Calça" }, { name: "Short" }, { name: "Bermuda" }],
};

const Create = () => {
  const navigate = useNavigate();

  const [selected, setSelected] = useState<BodyPart | null>(null);
  const [selectedPart, setSelectedPart] = useState<BodyPart | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);

  // Subtipos opcionais por tipo
  const specificModels: Record<string, ModelItem[]> = {
    Camiseta: [
      { name: "Básica" },
      { name: "Oversized" },
      { name: "Manga Longa" },
      { name: "Masculino + Shorts" },
      { name: "Manga Longa Feminina" },
      { name: "Low Poly (GLB)" },
      { name: "Low Poly (USDZ)" },
      { name: "TShirt (GLTF)" },
      { name: "TShirt 3D Free" },
    ],
    Camisa: [{ name: "Social" }, { name: "Casual" }],
    Jaqueta: [{ name: "Couro" }, { name: "Jeans" }, { name: "Corta-vento" }],
    Moletom: [{ name: "Com capuz" }, { name: "Sem capuz" }],
    Calça: [{ name: "Jeans" }, { name: "Moletom" }, { name: "Cargo" }],
    Short: [{ name: "Esportivo" }, { name: "Casual" }],
    Bermuda: [{ name: "Jeans" }, { name: "Sarja" }],
    Boné: [{ name: "Aba curva" }, { name: "Aba reta" }],
  };

  const colorize = (list: ModelItem[]) =>
    list.map((item, idx) => ({ ...item, color: item.color || PALETTE[idx % PALETTE.length] }));

  const typeOptions = useMemo(() => {
    if (!selectedPart) return [];
    return colorize(clothingTypes[selectedPart] || []);
  }, [selectedPart]);

  const subtypeOptions = useMemo(() => {
    if (!selectedType) return [];
    const list = specificModels[selectedType] || [];
    return colorize(list);
  }, [selectedType]);

  const requiresSubtype = selectedType ? (specificModels[selectedType]?.length ?? 0) > 0 : false;
  const canContinue =
    !!selectedPart && !!selectedType && (requiresSubtype ? !!selectedSubtype : true);

  const handleContinue = () => {
    if (!canContinue) return;
    navigate("/creation", {
      state: {
        part: selectedPart,
        type: selectedType,
        subtype: selectedSubtype,
      },
    });
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-6 py-10">
        <div className="flex flex-col">
          <h1 className="text-3xl font-semibold tracking-tight">Criar peça</h1>


          <div className="mt-4 text-base md:text-lg font-semibold text-slate-800 pl-3 border-l-4 border-indigo-400 w-fit">
            Selecione o local da peça desejada
          </div>

          {/* GRID: em telas grandes vira 2 colunas (boneco fixo à esquerda) */}
          <div className="mt-3 grid w-full grid-cols-1 lg:grid-cols-[360px,1fr] gap-10 items-start">
            {/* ESQUERDA: boneco (sticky em lg+) */}
            <aside className="lg:sticky lg:top-24">
              <MannequinOnly
                selected={selected}
                setSelected={setSelected}
                setSelectedPart={(p) => {
                  setSelectedPart(p);
                  setSelectedType(null);
                  setSelectedSubtype(null);
                }}
              />
            </aside>

            {/* DIREITA: carrosséis lineares */}
            <section className="w-full">
              {/* Tipos */}
              {selectedPart ? (
                <div className="md:min-h-[260px]">
                  <h2 className="text-lg font-medium mb-3">Tipo de peça</h2>
                  <div className="w-full flex justify-center">
                    <LinearInfiniteCarousel
                      className="w-full"
                      items={typeOptions.map((it) => ({ id: it.name, label: it.name }))}
                      selectedId={selectedType}
                      onSelect={(id: string | null) => {
                        setSelectedType(id);
                        if (!id) setSelectedSubtype(null);
                      }}
                      cardSize={128}          // ✅ maior
                      cardGapPx={20}          // ✅ gap maior
                      dragSensitivity={1}
                      scaleAmplitude={0.20}   // ✅ crescimento natural/central
                      sigmaSteps={1.2}        // ✅ vizinhos também crescem
                    />
                  </div>
                </div>
              ) : (
                <div>
                </div>
              )}

              {/* Subtipo */}
              {selectedType && subtypeOptions.length > 0 && (
                <div className="mt-10 md:min-h-[260px]">
                  <h2 className="text-lg font-medium mb-3">Modelo específico</h2>
                  <div className="w-full flex justify-center">
                    <LinearInfiniteCarousel
                      className="w-full"
                      items={subtypeOptions.map((it) => ({ id: it.name, label: it.name }))}
                      selectedId={selectedSubtype}
                      onSelect={(id: string | null) => setSelectedSubtype(id)}
                      cardSize={128}
                      cardGapPx={20}
                      dragSensitivity={1}
                      scaleAmplitude={0.20}
                      sigmaSteps={1.2}
                    />
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Rodapé de ações */}
          <div className="mt-12 flex items-center gap-3">
            <Button variant="outline" className="px-6" onClick={() => navigate(-1)}>
              Voltar
            </Button>
            <Button className="px-6" disabled={!canContinue} onClick={handleContinue}>
              Continuar
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Create;

/* ===========================
   MannequinOnly — boneco fixo à esquerda (sem mudança funcional)
   =========================== */
function MannequinOnly({
  selected,
  setSelected,
  setSelectedPart,
}: {
  selected: BodyPart | null;
  setSelected: (b: BodyPart | null) => void;
  setSelectedPart: (b: BodyPart) => void;
}) {
  const onSelect = (part: BodyPart) => {
    setSelected(part);
    setSelectedPart(part);
  };

  return (
    <div className="pl-1">
      <svg
        viewBox="0 0 210 380"
        className="w-[240px] md:w-[300px] lg:w-[340px] h-auto mt-2"
        role="img"
        aria-label="Seleção da parte do corpo"
      >
        <defs>
          <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#d7dfe8" />
          </linearGradient>
          <linearGradient id="gradSelected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ddd6fe" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          <filter id="softShadow" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
          <filter id="selectGlow" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#a78bfa" floodOpacity="0.32" />
          </filter>
        </defs>

        <rect x="92" y="83" width="16" height="14" rx="7" fill="url(#gradNeutral)" filter="url(#softShadow)" />
        <rect x="36" y="110" width="24" height="100" rx="12" fill="url(#gradNeutral)" filter="url(#softShadow)" opacity="0.92" />
        <rect x="140" y="110" width="24" height="100" rx="12" fill="url(#gradNeutral)" filter="url(#softShadow)" opacity="0.92" />

        <circle
          cx="100"
          cy="60"
          r="34"
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("head")}
          fill={selected === "head" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "head" ? "url(#selectGlow)" : "url(#softShadow)"}
        />

        <rect
          x="62"
          y="100"
          width="76"
          height="110"
          rx="16"
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("torso")}
          fill={selected === "torso" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "torso" ? "url(#selectGlow)" : "url(#softShadow)"}
        />

        <rect
          x="70"
          y="208"
          width="60"
          height="26"
          rx="13"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
        />

        <rect
          x="60"
          y="230"
          width="34"
          height="120"
          rx="17"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("legs")}
        />
        <rect
          x="116"
          y="230"
          width="34"
          height="120"
          rx="17"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("legs")}
        />
      </svg>
    </div>
  );
}
