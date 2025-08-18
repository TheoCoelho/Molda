import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import "@/styles/uiverse-cards.css";

type BodyPart = "head" | "torso" | "legs";

type ModelItem = {
  name: string;
  color?: string;
};

const PALETTE = [
  "#e11d48","#f472b6","#fb923c","#facc15","#84cc16",
  "#10b981","#0ea5e9","#3b82f6","#8b5cf6","#a78bfa",
  "#60a5fa","#22d3ee","#34d399","#f59e0b","#ef4444",
];

/** Boneco orgânico: sem bordas, com degradês e sombras suaves */
function MannequinOnly({
  selected,
  onSelect,
}: {
  selected: BodyPart | null;
  onSelect: (p: BodyPart) => void;
}) {
  return (
    <div className="border border-slate-200 rounded-xl bg-white p-4 shadow-sm flex items-center justify-center">
      <svg
        viewBox="0 0 200 400"
        className="w-[220px] md:w-[260px]"
        aria-label="Seleção da parte do corpo"
      >
        <defs>
          {/* neutro suave */}
          <linearGradient id="gradNeutral" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eef2f7" />
            <stop offset="100%" stopColor="#d7dfe8" />
          </linearGradient>
          {/* selecionado (roxo sutil) */}
          <linearGradient id="gradSelected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ddd6fe" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
          {/* sombras macias */}
          <filter id="softShadow" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
          </filter>
          {/* glow discreto para selecionado */}
          <filter id="selectGlow" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#a78bfa" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* ---- ordem importa (itens "por trás" vêm antes) ---- */}

        {/* Pescoço (atrás da cabeça) */}
        <rect x="92" y="83" width="16" height="14" rx="7"
          fill="url(#gradNeutral)" filter="url(#softShadow)" />

        {/* Braços integrados (por trás do tronco) */}
        <rect x="36"  y="110" width="24" height="100" rx="12"
          fill="url(#gradNeutral)" filter="url(#softShadow)" opacity="0.92" />
        <rect x="140" y="110" width="24" height="100" rx="12"
          fill="url(#gradNeutral)" filter="url(#softShadow)" opacity="0.92" />

        {/* Pélvis (integra cintura com as pernas) */}
        <rect
          x="70" y="208" width="60" height="26" rx="13"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
        />

        {/* Pernas (cápsulas tocando a pélvis) */}
        <rect
          x="60" y="230" width="34" height="120" rx="17"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("legs")}
        />
        <rect
          x="106" y="230" width="34" height="120" rx="17"
          fill={selected === "legs" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "legs" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.005]"
          onClick={() => onSelect("legs")}
        />

        {/* Tronco orgânico (por cima dos braços) */}
        <rect
          x="54" y="98" width="92" height="114" rx="28"
          fill={selected === "torso" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "torso" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.01]"
          onClick={() => onSelect("torso")}
        />

        {/* Cabeça levemente sobre o pescoço */}
        <circle
          cx="100" cy="62" r="30"
          fill={selected === "head" ? "url(#gradSelected)" : "url(#gradNeutral)"}
          filter={selected === "head" ? "url(#selectGlow)" : "url(#softShadow)"}
          className="cursor-pointer transition-transform hover:scale-[1.02]"
          onClick={() => onSelect("head")}
        />

        {/* Pés minimalistas */}
        <rect x="56"  y="354" width="40" height="12" rx="6" fill="url(#gradNeutral)" filter="url(#softShadow)" />
        <rect x="104" y="354" width="40" height="12" rx="6" fill="url(#gradNeutral)" filter="url(#softShadow)" />
      </svg>
    </div>
  );
}

const Create = () => {
  const navigate = useNavigate();

  const [selectedPart, setSelectedPart] = useState<BodyPart | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);

  // Tipos por parte
  const clothingTypes: Record<BodyPart, ModelItem[]> = {
    head: [{ name: "Chapéu" }, { name: "Boné" }, { name: "Gorro" }, { name: "Bandana" }],
    torso: [{ name: "Camiseta" }, { name: "Regata" }, { name: "Camisa" }, { name: "Jaqueta" }, { name: "Moletom" }],
    legs: [{ name: "Calça" }, { name: "Short" }, { name: "Bermuda" }],
  };

  // Subtipos opcionais por tipo
  const specificModels: Record<string, ModelItem[]> = {
    "Camiseta": [{ name: "Básica" }, { name: "Oversized" }, { name: "Manga Longa" }],
    "Camisa": [{ name: "Social" }, { name: "Casual" }],
    "Jaqueta": [{ name: "Couro" }, { name: "Jeans" }, { name: "Corta-vento" }],
    "Moletom": [{ name: "Com capuz" }, { name: "Sem capuz" }],
    "Calça": [{ name: "Jeans" }, { name: "Moletom" }, { name: "Cargo" }],
    "Short": [{ name: "Esportivo" }, { name: "Casual" }],
    "Bermuda": [{ name: "Jeans" }, { name: "Sarja" }],
    "Boné": [{ name: "Aba curva" }, { name: "Aba reta" }],
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
  const canContinue = !!selectedPart && !!selectedType && (requiresSubtype ? !!selectedSubtype : true);

  const handleContinue = () => {
    if (!canContinue) return;
    navigate("/creation", { state: { part: selectedPart, type: selectedType, subtype: selectedSubtype } });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8 min-h-[calc(100vh-120px)] flex flex-col justify-center">
        <h1 className="text-3xl font-semibold tracking-tight">Criar peça</h1>
        <p className="text-slate-600 mt-1">
          Selecione a parte do corpo no boneco e, em seguida, escolha o tipo de peça.
        </p>

        {/* Título do boneco FORA da linha de flex para a centralização vertical considerar apenas o container branco */}
        <div className="mt-4 text-base md:text-lg font-semibold text-slate-800 pl-3 border-l-4 border-indigo-400 w-fit">
          Selecione o local da peça desejada
        </div>

        {/* Linha: esquerda (container do boneco) | direita (cards), centralizados verticalmente relativamente ao container */}
        <div className="mt-3 flex flex-col md:flex-row md:items-center md:gap-12 lg:gap-16">
          {/* ESQUERDA: apenas o container do boneco */}
          <aside className="md:w-1/3 lg:w-1/4">
            <MannequinOnly
              selected={selectedPart}
              onSelect={(p) => {
                setSelectedPart(p);
                setSelectedType(null);
                setSelectedSubtype(null);
              }}
            />
          </aside>

          {/* DIREITA: cards alinhados ao centro do container do boneco */}
          <section className="flex-1 md:pl-2">
            {/* Tipo de peça — cards Uiverse */}
            {selectedPart ? (
              <div className="mt-2">
                <h2 className="text-lg font-medium mb-3">Tipo de peça</h2>
                <div className="container-items">
                  {typeOptions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`item-card ${selectedType === item.name ? "selected" : ""}`}
                      style={{ ["--color" as any]: item.color }}
                      aria-label={`Selecionar ${item.name}`}
                      title={item.name}
                      onClick={() => {
                        setSelectedType(item.name);
                        setSelectedSubtype(null);
                      }}
                    >
                      <span className="item-label">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-600">
                Selecione uma parte do corpo no boneco para ver os tipos de peça disponíveis.
              </div>
            )}

            {/* Subtipo — cards Uiverse, quando existir */}
            {selectedType && subtypeOptions.length > 0 && (
              <div className="mt-10">
                <h2 className="text-lg font-medium mb-3">Modelo específico</h2>
                <div className="container-items">
                  {subtypeOptions.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className={`item-card ${selectedSubtype === item.name ? "selected" : ""}`}
                      style={{ ["--color" as any]: item.color }}
                      aria-label={`Selecionar ${item.name}`}
                      title={item.name}
                      onClick={() => setSelectedSubtype(item.name)}
                    >
                      <span className="item-label">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Ações */}
        <div className="mt-12 flex items-center gap-3">
          <Button variant="outline" className="px-6" onClick={() => navigate(-1)}>
            Voltar
          </Button>
          <Button className="px-6" disabled={!canContinue} onClick={handleContinue}>
            Continuar
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Create;
