import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import LinearInfiniteCarousel from "@/components/LinearInfiniteCarousel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import ExpirationTimer from "@/components/ExpirationTimer";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { ExternalDecalData, DecalTransform } from "../types/decals";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, Center, Environment, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DEFAULT_GIZMO_THEME } from "../../../gizmo-theme";

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
  tabDecalPlacements?: Record<string, DecalTransform>;
  canvasSnapshots?: Record<string, string>;
  activeCanvasTab?: string;
  savedAt?: string;
  draftKey?: string;
  draftId?: string;
  projectKey?: string;
  isPermanent?: boolean;
  ephemeralExpiresAt?: string | null;
};

type DraftRecord = {
  id: string;
  projectKey: string;
  updatedAt: string | null;
  data: DraftData;
};

const COUNTDOWN_TICK_MS = 1000;

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
  const [nowTs, setNowTs] = useState(() => Date.now());
  const pendingDeletionRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

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

  const resolveExpirationTs = useCallback((draft: DraftRecord): number | null => {
    if (draft.data.isPermanent) return null;
    if (!draft.data.ephemeralExpiresAt) return null;
    const ts = Date.parse(draft.data.ephemeralExpiresAt);
    if (Number.isNaN(ts)) return null;
    return ts;
  }, []);

  const removeDraftLocally = useCallback((draftId: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== draftId));
    setSelectedDraftId((prev) => (prev === draftId ? null : prev));
  }, []);

  const handleExpireDraft = useCallback(
    async (draft: DraftRecord) => {
      removeDraftLocally(draft.id);
      if (!supabase) {
        pendingDeletionRef.current.delete(draft.id);
        return;
      }
      try {
        await supabase.from("project_drafts").delete().eq("id", draft.id);
      } catch (err) {
        console.error("Falha ao excluir rascunho expirado:", err);
      } finally {
        pendingDeletionRef.current.delete(draft.id);
      }
    },
    [removeDraftLocally]
  );

  const handleMakePermanent = useCallback(
    async (draft: DraftRecord) => {
      const nextData = {
        ...draft.data,
        isPermanent: true,
        ephemeralExpiresAt: null,
      } satisfies DraftData;

      setDrafts((prev) =>
        prev.map((item) => (item.id === draft.id ? { ...item, data: nextData } : item))
      );

      // Atualiza localStorage imediatamente
      try {
        const storedPayload = {
          ...nextData,
          draftId: draft.id,
          draftKey: draft.projectKey || nextData.draftKey || nextData.projectKey,
          projectKey: draft.projectKey || nextData.draftKey || nextData.projectKey,
        };
        localStorage.setItem("currentProject", JSON.stringify(storedPayload));
      } catch (err) {
        console.warn("Falha ao atualizar localStorage ao tornar draft permanente:", err);
      }

      if (!supabase) return;
      try {
        await supabase.from("project_drafts").update({ data: nextData }).eq("id", draft.id);
      } catch (err) {
        console.error("Falha ao manter rascunho permanentemente:", err);
      }
    },
    []
  );

  useEffect(() => {
    drafts.forEach((draft) => {
      const expiresAt = resolveExpirationTs(draft);
      if (expiresAt === null) return;
      if (expiresAt > nowTs) return;
      if (pendingDeletionRef.current.has(draft.id)) return;
      pendingDeletionRef.current.add(draft.id);
      void handleExpireDraft(draft);
    });
  }, [drafts, handleExpireDraft, nowTs, resolveExpirationTs]);

  const selectedDraft = useMemo(() => {
    if (!selectedDraftId) return null;
    return drafts.find((draft) => draft.id === selectedDraftId) ?? null;
  }, [drafts, selectedDraftId]);

  const selectedDraftDecals = useMemo<ExternalDecalData[]>(() => {
    if (!selectedDraft) return [];
    const tabs = selectedDraft.data.canvasTabs ?? [];
    const previews = selectedDraft.data.tabDecalPreviews ?? {};
    const visibility = selectedDraft.data.tabVisibility ?? {};
    const placements = selectedDraft.data.tabDecalPlacements ?? {};
    return tabs
      .filter((tab) => tab.type === "2d" && visibility[tab.id] && previews[tab.id])
      .map((tab) => ({
        id: tab.id,
        label: tab.name,
        dataUrl: previews[tab.id],
        transform: placements[tab.id] ?? null,
      }));
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
                  <Mannequin3D
                    selected={selected}
                    setSelected={setSelected}
                    setSelectedPart={(p: BodyPart) => {
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
              <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr] lg:items-start">
                <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2 scrollbar-soft">
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
                        const expiresAt = resolveExpirationTs(draft);
                        const remainingMs = expiresAt === null ? null : expiresAt - nowTs;
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
                                {/* Timer de expiração ou badge de tamanho */}
                                {remainingMs !== null && remainingMs > 0 ? (
                                  <ExpirationTimer
                                    remainingMs={remainingMs}
                                    onMakePermanent={() => handleMakePermanent(draft)}
                                  />
                                ) : (
                                  <span className="inline-flex h-6 items-center gap-2 rounded-full border px-3 text-[11px] uppercase tracking-wide text-muted-foreground">
                                    <span
                                      className="h-3 w-3 rounded-full border"
                                      style={{ backgroundColor: draft.data.baseColor || "#ffffff" }}
                                    />
                                    {sizeLabel}
                                  </span>
                                )}
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

                <div className="glass relative flex items-center justify-center rounded-2xl border shadow-sm h-[calc(100vh-280px)] min-h-[500px]">
                  {selectedDraft ? (
                    <div className="relative h-full w-full">
                      <Canvas3DViewer
                        key={selectedDraft.id}
                        baseColor={selectedDraftBaseColor}
                        externalDecals={selectedDraftDecals}
                        interactive={false}
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
   Mannequin3D — viewer 3D com divisão visual por regiões do corpo
   =========================== */
function Mannequin3D({
  selected,
  setSelected,
  setSelectedPart,
}: {
  selected: BodyPart | null;
  setSelected: (b: BodyPart | null) => void;
  setSelectedPart: (b: BodyPart) => void;
}) {
  const [hovered, setHovered] = useState<BodyPart | null>(null);

  const handleSelect = useCallback(
    (part: BodyPart) => {
      setSelected(part);
      setSelectedPart(part);
    },
    [setSelected, setSelectedPart]
  );

  const overlaySectionClass = useCallback(
    (part: BodyPart, withDivider: boolean) =>
      cn(
        "transition-colors duration-150",
        withDivider ? "border-b border-indigo-400/35" : "",
        hovered === part
          ? "bg-indigo-500/20"
          : selected === part
            ? "bg-indigo-400/12"
            : "bg-transparent"
      ),
    [hovered, selected]
  );

  return (
    <div className="pl-1">
      <div className="relative mx-auto w-full max-w-[420px]" style={{ height: "560px" }}>
        <Canvas
          camera={{ position: [0, 0.35, 2.2], fov: 36 }}
          style={{ width: "100%", height: "100%" }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 1.8]}
        >
          <ambientLight intensity={0.7} />
          <directionalLight position={[4, 6, 6]} intensity={1.15} />
          <directionalLight position={[-3, 5, -4]} intensity={0.45} />

          <Suspense fallback={<Html center className="text-xs text-slate-200">Carregando...</Html>}>
            <Bounds fit clip observe margin={0.65}>
              <Center>
                <SegmentedMannequin
                  selected={selected}
                  hovered={hovered}
                  onHover={setHovered}
                  onSelect={handleSelect}
                />
              </Center>
            </Bounds>
          </Suspense>

          <Suspense fallback={null}>
            <Environment files="/hdri/studio_small_03_1k.hdr" backgroundRotation={[0, Math.PI, 0]} />
          </Suspense>
          <OrbitControls enablePan={false} enableZoom={false} enableRotate={false} />
        </Canvas>

        <div className="pointer-events-none absolute inset-0 rounded-lg border border-indigo-400/40 overflow-hidden">
          <div className="flex h-full flex-col">
            <div
              className={overlaySectionClass("head", true)}
              style={{ flexBasis: "20%", flexGrow: 0, flexShrink: 0 }}
            />
            <div
              className={overlaySectionClass("torso", true)}
              style={{ flexBasis: "40%", flexGrow: 0, flexShrink: 0 }}
            />
            <div
              className={overlaySectionClass("legs", false)}
              style={{ flexBasis: "40%", flexGrow: 0, flexShrink: 0 }}
            />
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-center gap-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <button
          type="button"
          onClick={() => handleSelect("head")}
          onMouseEnter={() => setHovered("head")}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "transition-colors hover:text-slate-200",
            selected === "head" ? "text-indigo-300" : undefined
          )}
        >
          Cabeça
        </button>
        <button
          type="button"
          onClick={() => handleSelect("torso")}
          onMouseEnter={() => setHovered("torso")}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "transition-colors hover:text-slate-200",
            selected === "torso" ? "text-indigo-300" : undefined
          )}
        >
          Tronco
        </button>
        <button
          type="button"
          onClick={() => handleSelect("legs")}
          onMouseEnter={() => setHovered("legs")}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "transition-colors hover:text-slate-200",
            selected === "legs" ? "text-indigo-300" : undefined
          )}
        >
          Pernas
        </button>
      </div>
    </div>
  );
}

type SegmentedMannequinProps = {
  selected: BodyPart | null;
  hovered: BodyPart | null;
  onHover: (part: BodyPart | null) => void;
  onSelect: (part: BodyPart) => void;
};

function SegmentedMannequin({ selected, hovered, onHover, onSelect }: SegmentedMannequinProps) {
  const { scene } = useGLTF("/models/mannequin/scene.gltf");
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  const thresholds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(clonedScene);
    const minY = box.min.y;
    const maxY = box.max.y;
    const span = maxY - minY || 1;
    const centerY = (maxY + minY) / 2;
    return {
      headStart: maxY - span * 0.2 - centerY,
      torsoStart: maxY - span * 0.6 - centerY,
    };
  }, [clonedScene]);

  const uniformsRef = useRef<{
    uHeadStart: { value: number };
    uTorsoStart: { value: number };
    uSelected: { value: THREE.Vector3 };
    uHovered: { value: THREE.Vector3 };
    uSelectedColor: { value: THREE.Color };
    uHoverColor: { value: THREE.Color };
  }>();

  if (!uniformsRef.current) {
    uniformsRef.current = {
      uHeadStart: { value: thresholds.headStart },
      uTorsoStart: { value: thresholds.torsoStart },
      uSelected: { value: new THREE.Vector3(0, 0, 0) },
      uHovered: { value: new THREE.Vector3(0, 0, 0) },
  uSelectedColor: { value: new THREE.Color(DEFAULT_GIZMO_THEME.primary) },
  uHoverColor: { value: new THREE.Color(DEFAULT_GIZMO_THEME.secondary) },
    };
  }

  const uniforms = uniformsRef.current;
  uniforms.uHeadStart.value = thresholds.headStart;
  uniforms.uTorsoStart.value = thresholds.torsoStart;

  useEffect(() => {
    const enhanceMaterial = (material: THREE.Material | null | undefined): THREE.Material | null | undefined => {
      if (!material || typeof (material as any).clone !== "function") return material;
      const clonedMaterial = (material as THREE.MeshStandardMaterial).clone();
      clonedMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.uHeadStart = uniforms.uHeadStart;
  shader.uniforms.uTorsoStart = uniforms.uTorsoStart;
        shader.uniforms.uSelected = uniforms.uSelected;
        shader.uniforms.uHovered = uniforms.uHovered;
        shader.uniforms.uSelectedColor = uniforms.uSelectedColor;
        shader.uniforms.uHoverColor = uniforms.uHoverColor;

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\n  varying vec3 vWorldPosition;"
          )
          .replace(
            "#include <worldpos_vertex>",
            "#include <worldpos_vertex>\n  vWorldPosition = worldPosition.xyz;"
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
  varying vec3 vWorldPosition;
  uniform float uHeadStart;
  uniform float uTorsoStart;
  uniform vec3 uSelected;
  uniform vec3 uHovered;
  uniform vec3 uSelectedColor;
  uniform vec3 uHoverColor;`
          )
          .replace(
            "#include <output_fragment>",
            `
  float regionIndex;
  if (vWorldPosition.y >= uHeadStart) {
    regionIndex = 0.0;
  } else if (vWorldPosition.y >= uTorsoStart) {
    regionIndex = 1.0;
  } else {
    regionIndex = 2.0;
  }

  // Determine if any selection is active
  float anySelected = max(uSelected.x, max(uSelected.y, uSelected.z));

  vec3 baseColor = diffuseColor.rgb;
  vec3 outColor = baseColor;

  if (anySelected > 0.5) {
    // Apply selected color ONLY to the selected region; others remain unchanged
    if (regionIndex < 0.5 && uSelected.x > 0.5) {
      outColor = uSelectedColor;
    } else if (regionIndex >= 0.5 && regionIndex < 1.5 && uSelected.y > 0.5) {
      outColor = uSelectedColor;
    } else if (regionIndex >= 1.5 && uSelected.z > 0.5) {
      outColor = uSelectedColor;
    } else {
      outColor = baseColor;
    }
  } else {
    // No selection: allow a subtle hover tint only on hovered region
    float hoverBlend = 0.0;
    if (regionIndex < 0.5) {
      hoverBlend = uHovered.x * 0.35;
    } else if (regionIndex < 1.5) {
      hoverBlend = uHovered.y * 0.35;
    } else {
      hoverBlend = uHovered.z * 0.35;
    }
    outColor = mix(baseColor, uHoverColor, hoverBlend);
  }

  diffuseColor.rgb = outColor;
  #include <output_fragment>`
          );
      };
      clonedMaterial.needsUpdate = true;
      return clonedMaterial;
    };

    clonedScene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh?.isMesh) return;
      const baseMaterial = mesh.material;
      if (Array.isArray(baseMaterial)) {
        mesh.material = baseMaterial.map((mat) => enhanceMaterial(mat) as THREE.Material);
      } else {
        mesh.material = enhanceMaterial(baseMaterial) as THREE.Material;
      }
    });
  }, [clonedScene, uniforms]);

  useEffect(() => {
    uniforms.uSelected.value.set(
      selected === "head" ? 1 : 0,
      selected === "torso" ? 1 : 0,
      selected === "legs" ? 1 : 0
    );
  }, [selected, uniforms]);

  useEffect(() => {
    uniforms.uHovered.value.set(
      hovered === "head" ? 1 : 0,
      hovered === "torso" ? 1 : 0,
      hovered === "legs" ? 1 : 0
    );
  }, [hovered, uniforms]);

  const resolvePart = useCallback(
    (y: number): BodyPart => {
      if (y >= thresholds.headStart) return "head";
      if (y >= thresholds.torsoStart) return "torso";
      return "legs";
    },
    [thresholds.headStart, thresholds.torsoStart]
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const part = resolvePart(event.point.y);
      onHover(part);
    },
    [onHover, resolvePart]
  );

  const handlePointerOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (event.intersections.length === 0) onHover(null);
    },
    [onHover]
  );

  const handleClick = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const part = resolvePart(event.point.y);
      onSelect(part);
    },
    [onSelect, resolvePart]
  );

  return (
    <primitive
      object={clonedScene}
      rotation={[0, 0, 0]}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

useGLTF.preload("/models/mannequin/scene.gltf");
