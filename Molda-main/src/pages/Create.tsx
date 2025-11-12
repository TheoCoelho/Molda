import { useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import LinearInfiniteCarousel from "@/components/LinearInfiniteCarousel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

type ViewMode = "create" | "drafts";

type DraftCanvasTab = { id: string; name: string; type: "2d" | "3d" };

type DraftData = {
  projectName?: string;
  baseColor?: string;
  size?: string;
  fabric?: string;
  notes?: string;
  part?: string | null;
  type?: string | null;
  subtype?: string | null;
  canvasTabs?: DraftCanvasTab[];
  tabVisibility?: Record<string, boolean>;
  tabDecalPreviews?: Record<string, string>;
  canvasSnapshots?: Record<string, string>;
  activeCanvasTab?: string;
  savedAt?: string;
  draftKey?: string;
  draftId?: string;
  projectKey?: string;
};

type DraftRecord = {
  id: string;
  projectKey: string;
  updatedAt: string | null;
  data: DraftData;
};

const Create = () => {
  const navigate = useNavigate();

  const [viewMode, setViewMode] = useState<ViewMode>("create");
  const [selected, setSelected] = useState<BodyPart | null>(null);
  const [selectedPart, setSelectedPart] = useState<BodyPart | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedSubtype, setSelectedSubtype] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (viewMode !== "drafts") return;
    let cancelled = false;

    const fetchDrafts = async () => {
      setDraftsLoading(true);
      setDraftsError(null);

      if (!supabase) {
        setDraftsError("Supabase não configurado no frontend.");
        setDrafts([]);
        setDraftsLoading(false);
        return;
      }

      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (userErr) {
          if (!cancelled) {
            console.error("Erro ao obter usuário para listar rascunhos:", userErr);
            setDraftsError("Não foi possível confirmar o usuário.");
            setDrafts([]);
          }
          return;
        }
        const user = userRes?.user;
        if (!user) {
          if (!cancelled) {
            setDraftsError("Faça login para acessar seus rascunhos.");
            setDrafts([]);
          }
          return;
        }

        const { data, error } = await supabase
          .from("project_drafts")
          .select("id, project_key, data, updated_at")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false });

        if (error) {
          if (!cancelled) {
            console.error("Erro ao carregar rascunhos:", error);
            setDraftsError("Erro ao carregar rascunhos.");
            setDrafts([]);
          }
          return;
        }

        if (cancelled) return;

        const mapped: DraftRecord[] = (data ?? []).map((row: any) => ({
          id: row.id as string,
          projectKey: (row.project_key ?? "") as string,
          updatedAt: (row.updated_at ?? null) as string | null,
          data: (row.data ?? {}) as DraftData,
        }));

        setDrafts(mapped);
        if (mapped.length) {
          setSelectedDraftId((prev) => {
            if (prev && mapped.some((d) => d.id === prev)) return prev;
            return mapped[0].id;
          });
        } else {
          setSelectedDraftId(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro inesperado ao buscar rascunhos:", err);
          setDraftsError("Erro inesperado ao carregar rascunhos.");
          setDrafts([]);
        }
      } finally {
        if (!cancelled) setDraftsLoading(false);
      }
    };

    void fetchDrafts();

    return () => {
      cancelled = true;
    };
  }, [viewMode]);

  const selectedDraft = useMemo(() => {
    if (!selectedDraftId) return null;
    return drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  }, [drafts, selectedDraftId]);

  const selectedDraftDecals = useMemo(() => {
    if (!selectedDraft) return [];
    const tabs = selectedDraft.data.canvasTabs ?? [];
    const previews = selectedDraft.data.tabDecalPreviews ?? {};
    const visibility = selectedDraft.data.tabVisibility ?? {};
    return tabs
      .filter((tab) => tab.type === "2d" && visibility[tab.id] && previews[tab.id])
      .map((tab) => ({ id: tab.id, label: tab.name, dataUrl: previews[tab.id] }));
  }, [selectedDraft]);

  const selectedDraftBaseColor = selectedDraft?.data.baseColor || "#ffffff";

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return "Data não disponível";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Data não disponível";
    return date.toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  const getSelectionSummary = (data: DraftData) => {
    const labels = [data.part, data.type, data.subtype].filter((item): item is string => !!item);
    if (!labels.length) return "Modelo padrão";
    return labels.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" • ");
  };

  const handleLoadDraft = (draft: DraftRecord) => {
    const data = draft.data ?? {};
    const draftKey = draft.projectKey || data.draftKey || data.projectKey || undefined;
    const payload: DraftData = {
      ...data,
      draftId: draft.id,
      draftKey,
      projectKey: draftKey,
    };
    try {
      localStorage.setItem("currentProject", JSON.stringify(payload));
    } catch (err) {
      console.warn("Não foi possível persistir o rascunho localmente:", err);
    }

    const params = new URLSearchParams();
    if (data.part) params.set("part", data.part);
    if (data.type) params.set("type", data.type);
    if (data.subtype) params.set("subtype", data.subtype);

    const query = params.toString();
    navigate(`/creation${query ? `?${query}` : ""}`, {
      state: {
        part: data.part ?? undefined,
        type: data.type ?? undefined,
        subtype: data.subtype ?? undefined,
        restoreDraft: true,
        draftId: draft.id,
        draftKey,
      },
    });
  };

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
    try {
      localStorage.removeItem("currentProject");
    } catch {}
    const params = new URLSearchParams();
    if (selectedPart) params.set("part", selectedPart);
    if (selectedType) params.set("type", selectedType);
    if (selectedSubtype) params.set("subtype", selectedSubtype);
    const query = params.toString();
    navigate(`/creation${query ? `?${query}` : ""}`, {
      state: {
        part: selectedPart,
        type: selectedType,
        subtype: selectedSubtype,
        startFresh: true,
      },
    });
  };

  return (
    <div className="min-h-screen">
      <Header />

      <main className="container mx-auto px-6 py-10">
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Criar peça</h1>
          </div>

          <Tabs
            value={viewMode}
            onValueChange={(value: string) => setViewMode(value as ViewMode)}
            className="mt-6"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="create">Criar</TabsTrigger>
              <TabsTrigger value="drafts">Rascunhos</TabsTrigger>
            </TabsList>

            <TabsContent value="create" className="mt-6">
              <div className="text-base md:text-lg font-semibold text-slate-800 pl-3 border-l-4 border-indigo-400 w-fit">
                Selecione o local da peça desejada
              </div>

              {/* GRID: em telas grandes vira 2 colunas (boneco fixo à esquerda) */}
              <div className="mt-3 grid w-full grid-cols-1 items-start gap-10 lg:grid-cols-[360px,1fr]">
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
                      <h2 className="mb-3 text-lg font-medium">Tipo de peça</h2>
                      <div className="flex w-full justify-center">
                        <LinearInfiniteCarousel
                          className="w-full"
                          items={typeOptions.map((it) => ({ id: it.name, label: it.name }))}
                          selectedId={selectedType}
                          onSelect={(id: string | null) => {
                            setSelectedType(id);
                            if (!id) setSelectedSubtype(null);
                          }}
                          cardSize={128}
                          cardGapPx={20}
                          dragSensitivity={1}
                          scaleAmplitude={0.2}
                          sigmaSteps={1.2}
                        />
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}

                  {/* Subtipo */}
                  {selectedType && subtypeOptions.length > 0 && (
                    <div className="mt-10 md:min-h-[260px]">
                      <h2 className="mb-3 text-lg font-medium">Modelo específico</h2>
                      <div className="flex w-full justify-center">
                        <LinearInfiniteCarousel
                          className="w-full"
                          items={subtypeOptions.map((it) => ({ id: it.name, label: it.name }))}
                          selectedId={selectedSubtype}
                          onSelect={(id: string | null) => setSelectedSubtype(id)}
                          cardSize={128}
                          cardGapPx={20}
                          dragSensitivity={1}
                          scaleAmplitude={0.2}
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
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
              <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
                <div className="space-y-3">
                  {draftsLoading ? (
                    <div className="space-y-3">
                      <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                      <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                      <div className="h-14 rounded-xl bg-muted/60 animate-pulse" />
                    </div>
                  ) : draftsError ? (
                    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {draftsError}
                    </div>
                  ) : drafts.length === 0 ? (
                    <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                      Nenhum rascunho salvo ainda. Volte para a aba Criar para iniciar um novo projeto.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {drafts.map((draft) => {
                        const isActive = draft.id === selectedDraftId;
                        const summary = getSelectionSummary(draft.data);
                        const updatedAtLabel = formatDateTime(draft.updatedAt ?? draft.data.savedAt ?? null);
                        const sizeLabel = draft.data.size || "Tamanho livre";
                        return (
                          <li key={draft.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedDraftId(draft.id)}
                              className={cn(
                                "w-full rounded-xl border px-4 py-3 text-left transition",
                                "hover:border-primary/60 hover:bg-primary/5",
                                isActive ? "border-primary bg-primary/10" : "border-border bg-background"
                              )}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-semibold">
                                  {draft.data.projectName || "Projeto sem nome"}
                                </span>
                                <span className="text-xs text-muted-foreground">{updatedAtLabel}</span>
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">{summary}</div>
                              <div className="mt-3 flex items-center justify-between gap-2">
                                <span className="inline-flex h-6 items-center gap-2 rounded-full border px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                                  <span
                                    className="h-3 w-3 rounded-full border"
                                    style={{ backgroundColor: draft.data.baseColor || "#ffffff" }}
                                  />
                                  {sizeLabel}
                                </span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isActive ? "default" : "outline"}
                                  onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                                    event.stopPropagation();
                                    handleLoadDraft(draft);
                                  }}
                                >
                                  Continuar edição
                                </Button>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="glass relative flex min-h-[320px] items-center justify-center rounded-2xl border shadow-sm">
                  {selectedDraft ? (
                    <div className="relative h-full w-full">
                      <Canvas3DViewer
                        key={selectedDraft.id}
                        baseColor={selectedDraftBaseColor}
                        externalDecals={selectedDraftDecals}
                        selectionOverride={{
                          part: selectedDraft.data.part ?? undefined,
                          type: selectedDraft.data.type ?? undefined,
                          subtype: selectedDraft.data.subtype ?? undefined,
                        }}
                        className="h-full w-full"
                      />
                    </div>
                  ) : (
                    <p className="max-w-xs px-6 text-center text-sm text-muted-foreground">
                      Selecione um rascunho para visualizar o modelo 3D salvo.
                    </p>
                  )}

                  {selectedDraft && !selectedDraftDecals.length && (
                    <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-background/70 px-3 py-1 text-[11px] text-muted-foreground shadow">
                      Nenhum decal visível neste rascunho.
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
