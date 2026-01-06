// src/pages/Profile.tsx
import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Settings, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET } from "@/lib/constants/storage";
import type { DecalTransform, ExternalDecalData } from "@/types/decals";
import { getProjectDisplayName } from "@/lib/creativeNames";

type ViewUser = {
  id?: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string;       // URL pronta para exibição
  createdAt?: string;
};

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

type CreationItem = {
  id: string;
  title: string;
  date: string;
  status: "finalizada" | "rascunho" | "producao";
  draft?: DraftRecord;
  baseColor?: string;
  selection?: { part?: string | null; type?: string | null; subtype?: string | null };
  externalDecals?: ExternalDecalData[];
};

const Profile = () => {
  const { user: authUser, session, getProfile } = useAuth();
  const navigate = useNavigate();

  const [user, setUser] = useState<ViewUser>({
    name: "Usuário",
    username: "",
    email: "",
    avatar: "",
    createdAt: "Janeiro 2024",
  });

  // Estado do upload (mantido)
  const [openUpload, setOpenUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Edição de nickname/username
  const [editing, setEditing] = useState({ nickname: false, username: false });
  const [form, setForm] = useState({ nickname: "", username: "" });
  const [usernameTaken, setUsernameTaken] = useState<boolean | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [savingField, setSavingField] = useState<"nickname" | "username" | null>(null);

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [piecesFilter, setPiecesFilter] = useState<"todas" | "finalizadas" | "rascunhos">("todas");

  const [savedElements] = useState([
    { id: 1, type: "image", name: "Logo Empresa", preview: "/api/placeholder/100/100" },
    { id: 2, type: "text",  name: "Frase Motivacional", content: "Seja a mudança" },
    { id: 3, type: "drawing", name: "Desenho Abstrato", preview: "/api/placeholder/100/100" },
    { id: 4, type: "pattern", name: "Padrão Geométrico", preview: "/api/placeholder/100/100" },
  ]);

  const formatShortDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("pt-BR");
  };

  const resolveDraftDecals = (data: DraftData): ExternalDecalData[] => {
    const tabs = data.canvasTabs ?? [];
    const previews = data.tabDecalPreviews ?? {};
    const visibility = data.tabVisibility ?? {};
    const placements = data.tabDecalPlacements ?? {};

    const fromTabs = tabs
      .filter((tab) => tab.type === "2d" && visibility[tab.id] && previews[tab.id])
      .map((tab) => ({
        id: tab.id,
        label: tab.name,
        dataUrl: previews[tab.id] as string,
        transform: placements[tab.id] ?? null,
      } satisfies ExternalDecalData));

    if (fromTabs.length) return fromTabs;

    // fallback: se não houver tabs/visibilidade, tenta renderizar qualquer preview disponível
    return Object.entries(previews)
      .filter(([, url]) => Boolean(url))
      .map(([id, url]) => ({
        id,
        label: id,
        dataUrl: url as string,
        transform: placements[id] ?? null,
      } satisfies ExternalDecalData));
  };

  const creations: CreationItem[] = useMemo(() => {
    const items = drafts.map((draft) => {
      const title = getProjectDisplayName(draft.data.projectName, draft.id);
      const date = formatShortDate(draft.updatedAt ?? draft.data.savedAt ?? null);
      return {
        id: draft.id,
        title,
        date,
        status: "rascunho",
        draft,
        baseColor: draft.data.baseColor || "#ffffff",
        selection: {
          part: draft.data.part ?? null,
          type: draft.data.type ?? null,
          subtype: draft.data.subtype ?? null,
        },
        externalDecals: resolveDraftDecals(draft.data),
      } satisfies CreationItem;
    });

    if (piecesFilter === "finalizadas") return items.filter((item) => item.status === "finalizada");
    if (piecesFilter === "rascunhos") return items.filter((item) => item.status === "rascunho");
    return items;
  }, [drafts, piecesFilter]);

  useEffect(() => {
    if (!authUser?.id) return;
    let cancelled = false;

    const fetchDrafts = async () => {
      setDraftsLoading(true);
      setDraftsError(null);

      try {
        const { data, error } = await supabase
          .from("project_drafts")
          .select("id, project_key, data, updated_at")
          .eq("user_id", authUser.id)
          .order("updated_at", { ascending: false });

        if (cancelled) return;

        if (error) {
          console.error("Erro ao carregar rascunhos:", error);
          setDraftsError("Erro ao carregar rascunhos.");
          setDrafts([]);
          return;
        }

        const mapped: DraftRecord[] = (data ?? []).map((row: any) => ({
          id: String(row.id),
          projectKey: String(row.project_key ?? ""),
          updatedAt: (row.updated_at ?? null) as string | null,
          data: (row.data ?? {}) as DraftData,
        }));

        setDrafts(mapped);
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
  }, [authUser?.id]);

  const persistDraftToLocal = (draft: DraftRecord) => {
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
    return { payload, draftKey };
  };

  const handleEditDraft = (draft: DraftRecord) => {
    const { payload, draftKey } = persistDraftToLocal(draft);
    const params = new URLSearchParams();
    if (payload.part) params.set("part", payload.part);
    if (payload.type) params.set("type", payload.type);
    if (payload.subtype) params.set("subtype", payload.subtype);
    const query = params.toString();

    navigate(`/creation${query ? `?${query}` : ""}`,
      {
        state: {
          part: payload.part ?? undefined,
          type: payload.type ?? undefined,
          subtype: payload.subtype ?? undefined,
          restoreDraft: true,
          draftId: draft.id,
          draftKey,
        },
      }
    );
  };

  const handleProduceDraft = (draft: DraftRecord) => {
    persistDraftToLocal(draft);
    navigate("/finalize");
  };

  // Carrega profile e converte avatar_path -> publicUrl (mantido)
  useEffect(() => {
    const load = async () => {
      const createdAtStr = session?.user?.created_at
        ? new Date(session.user.created_at).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
        : "";

      let display: ViewUser = {
        id: authUser?.id,
        name:
          (authUser?.user_metadata as any)?.nickname ??
          (authUser?.user_metadata as any)?.name ??
          (authUser?.user_metadata as any)?.full_name ??
          "Usuário",
        username: (authUser?.user_metadata as any)?.username || "",
        avatar: "",
      };

      try {
        const prof = await getProfile();
        if (prof) {
          let avatarUrl = "";
          if (prof.avatar_path) {
            const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(prof.avatar_path);
            avatarUrl = data.publicUrl;
          }

          display = {
            ...display,
            name: (prof.nickname ?? prof.full_name ?? display.name),
            username: prof.username || display.username,
            email: prof.email ?? display.email,
            avatar: avatarUrl,
          };
        }
      } catch {
        /* silencioso */
      }

      // Prepara os campos de edição com os valores atuais
      setForm({
        nickname: display.name || "",
        username: display.username || "",
      });

      setUser(display);
    };
    load();
  }, [authUser, session, getProfile]);

  const getStatusBadge = (status: "finalizada" | "rascunho" | "producao") => {
    switch (status) {
      case "finalizada":
        return <Badge className="bg-green-100 text-green-800">Finalizada</Badge>;
      case "rascunho":
        return <Badge variant="secondary">Rascunho</Badge>;
      case "producao":
        return <Badge className="bg-blue-100 text-blue-800">Em produção</Badge>;
    }
  };

  const getAvatarFallback = (name: string) => {
    const safe = (name || "U").trim();
    const parts = safe.split(" ").filter(Boolean);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : (safe[0] || "U").toUpperCase();
  };

  // ===== Upload (mantido) =====
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f || null);
    setPreviewUrl(f ? URL.createObjectURL(f) : "");
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!authUser?.id) throw new Error("Usuário não autenticado");

    const path = `${authUser.id}/${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

  const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true });
    if (upErr) throw upErr;

    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_path: path, updated_at: new Date().toISOString() })
      .eq("id", authUser.id);
    if (updErr) throw updErr;

  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile) return;
    if (selectedFile.size > 5 * 1024 * 1024) {
      alert("Tamanho máximo 5MB");
      return;
    }
    setSaving(true);
    try {
      const url = await uploadAvatar(selectedFile);
      setUser((prev) => ({ ...prev, avatar: url })); // mantém atualização imediata
      setOpenUpload(false);
      setSelectedFile(null);
      setPreviewUrl("");
    } catch (e: any) {
      alert(e?.message || "Erro ao salvar avatar");
    } finally {
      setSaving(false);
    }
  };

  // ===== Username availability / save helpers =====
  async function isUsernameAvailable(u: string): Promise<boolean> {
    const candidate = (u || "").trim();
    if (!candidate) return false;

    // Tenta RPC (se existir)
    try {
      const { data, error } = await supabase.rpc("check_profile_availability", { username: candidate });
      if (!error && data && typeof (data as any).username_taken !== "undefined") {
        return !(data as any).username_taken;
      }
    } catch {
      // ignora e cai no fallback
    }

    // Fallback: consulta direta
    try {
      const { data: rows, error } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", candidate)
        .neq("id", authUser?.id || "")
        .limit(1);

      if (error) return false;
      return !(rows && rows.length > 0);
    } catch {
      return false;
    }
  }

  async function saveNickname() {
    const newNick = form.nickname.trim();
    if (!authUser?.id || !newNick) {
      setEditing((e) => ({ ...e, nickname: false }));
      return;
    }

    setSavingField("nickname");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ nickname: newNick, updated_at: new Date().toISOString() })
        .eq("id", authUser.id);
      if (error) throw error;

      // (opcional) atualiza metadados do usuário
      try { await supabase.auth.updateUser({ data: { nickname: newNick } }); } catch {}

      setUser((prev) => ({ ...prev, name: newNick }));
      setEditing((e) => ({ ...e, nickname: false }));
    } catch {
      // aqui você pode disparar um toast
    } finally {
      setSavingField(null);
    }
  }

  async function saveUsername() {
    const newUser = form.username.trim();
    if (!authUser?.id || !newUser) {
      setEditing((e) => ({ ...e, username: false }));
      return;
    }

    setCheckingUsername(true);
    const available = await isUsernameAvailable(newUser);
    setCheckingUsername(false);
    setUsernameTaken(!available);
    if (!available) return;

    setSavingField("username");
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ username: newUser, updated_at: new Date().toISOString() })
        .eq("id", authUser.id);
      if (error) throw error;

      // (opcional) atualiza metadados do usuário
      try { await supabase.auth.updateUser({ data: { username: newUser } }); } catch {}

      setUser((prev) => ({ ...prev, username: newUser }));
      setEditing((e) => ({ ...e, username: false }));
    } catch {
      // aqui você pode disparar um toast
    } finally {
      setSavingField(null);
    }
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="h-20" /> {/* Espaçador para compensar o header fixo */}
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Banner de perfil */}
        <Card className="mb-6">
          <CardHeader className="py-6">
            <div className="flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                {/* Avatar com hover + caneta (mantido) */}
                <div className="relative group">
                  <Avatar className="h-16 w-16">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                  </Avatar>
                  <button
                    aria-label="Editar foto de perfil"
                    onClick={() => setOpenUpload(true)}
                    className="hidden group-hover:flex absolute inset-0 items-center justify-center rounded-full bg-black/40"
                    title="Editar foto"
                  >
                    <Pencil className="w-5 h-5 text-white" />
                  </button>
                </div>

                <div>
                  {/* Linha do NICKNAME com lápis no hover */}
                  <div className="group flex items-center gap-2">
                    {!editing.nickname ? (
                      <>
                        <h1 className="text-2xl font-semibold">{user.name}</h1>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 transition"
                          title="Editar nickname"
                          onClick={() => {
                            setForm((f) => ({ ...f, nickname: user.name || "" }));
                            setEditing((e) => ({ ...e, nickname: true }));
                          }}
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={form.nickname}
                          onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                          className="h-8 w-56"
                          placeholder="Seu apelido"
                        />
                        <Button
                          size="sm"
                          onClick={saveNickname}
                          disabled={savingField === "nickname"}
                        >
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing((e) => ({ ...e, nickname: false }));
                            setForm((f) => ({ ...f, nickname: user.name || "" }));
                          }}
                        >
                          Cancelar
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Linha do USERNAME com lápis no hover */}
                  <div className="group flex items-center gap-2">
                    {!editing.username ? (
                      <>
                        <p className="text-gray-600 mb-1">@{user.username || "defina um usuário"}</p>
                        <button
                          type="button"
                          className="opacity-0 group-hover:opacity-100 transition"
                          title="Editar username"
                          onClick={() => {
                            setUsernameTaken(null);
                            setForm((f) => ({ ...f, username: user.username || "" }));
                            setEditing((e) => ({ ...e, username: true }));
                          }}
                        >
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          value={form.username}
                          onChange={(e) => {
                            setForm((f) => ({ ...f, username: e.target.value }));
                            setUsernameTaken(null);
                          }}
                          onBlur={async () => {
                            const v = form.username.trim();
                            if (v && v !== (user.username || "")) {
                              setCheckingUsername(true);
                              const available = await isUsernameAvailable(v);
                              setCheckingUsername(false);
                              setUsernameTaken(!available);
                            }
                          }}
                          className="h-8 w-56"
                          placeholder="seu_usuario"
                        />
                        <Button
                          size="sm"
                          onClick={saveUsername}
                          disabled={
                            savingField === "username" ||
                            checkingUsername ||
                            usernameTaken === true
                          }
                        >
                          {checkingUsername ? "Verificando..." : "Salvar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing((e) => ({ ...e, username: false }));
                            setForm((f) => ({ ...f, username: user.username || "" }));
                            setUsernameTaken(null);
                          }}
                        >
                          Cancelar
                        </Button>
                        {usernameTaken === true && (
                          <span className="text-xs text-red-600">Já em uso</span>
                        )}
                        {usernameTaken === false && (
                          <span className="text-xs text-green-600">Disponível</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Linhas restantes (inalteradas) */}
                  <p className="text-gray-600 mb-1"></p>
                  <p className="text-sm text-gray-500"></p>
                </div>
              </div>

              <div className="flex items-center gap-3">

                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{creations.length}</div>
                  <div className="text-xs text-gray-500">Criações</div>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* ===== Seções abaixo do banner (RESTauradas) ===== */}
        <Tabs defaultValue="creations" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
            <TabsTrigger value="creations">Minhas Peças</TabsTrigger>
            <TabsTrigger value="elements">Elementos Salvos</TabsTrigger>
          </TabsList>

          {/* Minhas Peças */}
          <TabsContent value="creations" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Minhas Peças</h2>
              <div className="flex gap-2">
                <Button
                  variant={piecesFilter === "todas" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPiecesFilter("todas")}
                >
                  Todas
                </Button>
                <Button
                  variant={piecesFilter === "finalizadas" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPiecesFilter("finalizadas")}
                >
                  Finalizadas
                </Button>
                <Button
                  variant={piecesFilter === "rascunhos" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPiecesFilter("rascunhos")}
                >
                  Rascunhos
                </Button>
              </div>
            </div>

            {draftsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Card key={idx} className="shadow-md">
                    <CardHeader className="p-3 pb-2">
                      <div className="h-4 w-24 rounded bg-muted/60 animate-pulse" />
                      <div className="mt-1 h-3 w-16 rounded bg-muted/60 animate-pulse" />
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-muted/60 mb-3 animate-pulse" />
                      <div className="flex gap-1.5">
                        <div className="h-8 w-full rounded bg-muted/60 animate-pulse" />
                        <div className="h-8 w-full rounded bg-muted/60 animate-pulse" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : draftsError ? (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {draftsError}
              </div>
            ) : creations.length === 0 ? (
              <div className="rounded-xl border border-dashed px-4 py-8 text-sm text-muted-foreground text-center">
                Nenhum rascunho salvo ainda.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {creations.map((item) => (
                  <Card key={item.id} className="shadow-md hover:shadow-lg transition-shadow">
                    <CardHeader className="p-3 pb-2">
                      <div className="flex items-center justify-between gap-1">
                        <CardTitle className="text-sm font-medium truncate">{item.title}</CardTitle>
                        {getStatusBadge(item.status)}
                      </div>
                      <p className="text-xs text-gray-500">
                        {item.date ? `Criado em ${item.date}` : ""}
                      </p>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-md bg-transparent mb-3">
                        <Canvas3DViewer
                          baseColor={item.baseColor || "#ffffff"}
                          externalDecals={item.externalDecals || []}
                          interactive={false}
                          selectionOverride={item.selection}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => item.draft && handleEditDraft(item.draft)}
                          disabled={!item.draft}
                        >
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => item.draft && handleProduceDraft(item.draft)}
                          disabled={!item.draft}
                        >
                          Produzir
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Elementos Salvos */}
          <TabsContent value="elements" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Elementos Salvos</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">Todos</Button>
                <Button variant="outline" size="sm">Imagens</Button>
                <Button variant="outline" size="sm">Textos</Button>
                <Button variant="outline" size="sm">Desenhos</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {savedElements.map((el: any) => (
                <Card key={el.id} className="shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{el.name}</CardTitle>
                    <p className="text-sm text-gray-500">Tipo: {el.type}</p>
                  </CardHeader>
                  <CardContent>
                    {"preview" in el ? (
                      <div className="aspect-square w-full overflow-hidden rounded-md bg-muted mb-4">
                        <img
                          src={el.preview}
                          alt={el.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="rounded-md border p-4 mb-4">
                        <p className="text-gray-700">{el.content}</p>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" className="w-full">Editar</Button>
                      <Button className="w-full">Adicionar à peça</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Dialog de upload (inalterado) */}
      <Dialog open={openUpload} onOpenChange={setOpenUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar foto de perfil</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {previewUrl ? (
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={previewUrl} />
                  <AvatarFallback>{getAvatarFallback(user.name)}</AvatarFallback>
                </Avatar>
                <div className="text-sm text-gray-600">Pré-visualização</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">Selecione uma imagem (JPG/PNG até ~5MB).</div>
            )}

            <input
              type="file"
              accept="image/*"
              onChange={onPickFile}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border file:px-4 file:py-2 file:text-sm file:font-medium file:bg-white file:hover:bg-gray-50"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUpload(false)}>Cancelar</Button>
            <Button onClick={handleSaveAvatar} disabled={!selectedFile || saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
