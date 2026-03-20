// src/pages/Profile.tsx
import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Earth, Loader2, MoreVertical, Pencil } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AVATAR_BUCKET } from "@/lib/constants/storage";
import { STORAGE_BUCKET } from "@/lib/supabaseClient";
import type { DecalTransform, ExternalDecalData } from "@/types/decals";
import { getProjectDisplayName } from "@/lib/creativeNames";

type ViewUser = {
  id?: string;
  name: string;
  username?: string;
  email?: string;
  avatar?: string;       // URL pronta para exibição
  designsCount?: number;
  piecesCount?: number;
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
  isPublic?: boolean;
  isPermanent?: boolean;
  ephemeralExpiresAt?: string | null;
};

type DraftRecord = {
  id: string;
  projectKey: string;
  updatedAt: string | null;
  data: DraftData;
  isPublic: boolean;
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
  isPublic: boolean;
};

type GalleryItem = {
  id: string;
  previewUrl: string;
  originalName: string;
  displayName: string;
  sortKey: string;
  isPublic: boolean;
  designValue: number;
};

type SocialProfileRow = {
  id: string;
  username: string | null;
  nickname: string | null;
  avatar_path: string | null;
  designs_count: number | null;
  pieces_count: number | null;
};

function normalizeUsername(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

const Profile = () => {
  const { user: authUser, getProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewedUsername = useMemo(() => normalizeUsername(searchParams.get("username")), [searchParams]);

  const viewedUserId = useMemo(() => {
    const fromQuery = (searchParams.get("user") || "").trim();
    if (fromQuery && fromQuery !== "undefined" && fromQuery !== "null") return fromQuery;
    // Se a rota vier por username, o id real será resolvido no load do profile.
    if (viewedUsername) return "";
    return authUser?.id || "";
  }, [searchParams, authUser?.id, viewedUsername]);

  const [user, setUser] = useState<ViewUser>({
    name: "Usuário",
    username: "",
    email: "",
    avatar: "",
    designsCount: 0,
    piecesCount: 0,
    createdAt: "Janeiro 2024",
  });

  const effectiveViewedUserId = user.id || viewedUserId;

  const isOwnProfile = Boolean(authUser?.id && effectiveViewedUserId && authUser.id === effectiveViewedUserId);

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
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [togglingGalleryIds, setTogglingGalleryIds] = useState<Record<string, boolean>>({});
  const [togglingPieceIds, setTogglingPieceIds] = useState<Record<string, boolean>>({});
  const [selectedDesign, setSelectedDesign] = useState<GalleryItem | null>(null);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [editNameInput, setEditNameInput] = useState("");
  const [editValueInput, setEditValueInput] = useState("0,00");
  const [savingDesignEdit, setSavingDesignEdit] = useState(false);
  const [replacingDesign, setReplacingDesign] = useState(false);
  const replaceDesignInputRef = useRef<HTMLInputElement | null>(null);

  const [piecesFilter, setPiecesFilter] = useState<"todas" | "finalizadas" | "rascunhos">("todas");

  const formatShortDate = (iso: string | null | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("pt-BR");
  };

  const formatGalleryDate = (sortKey: string | null | undefined) => {
    if (!sortKey || sortKey.length < 14) return "";

    const year = Number(sortKey.slice(0, 4));
    const month = Number(sortKey.slice(4, 6)) - 1;
    const day = Number(sortKey.slice(6, 8));
    const hours = Number(sortKey.slice(8, 10));
    const minutes = Number(sortKey.slice(10, 12));
    const seconds = Number(sortKey.slice(12, 14));
    const milliseconds = Number(sortKey.slice(14, 17) || "0");

    const date = new Date(year, month, day, hours, minutes, seconds, milliseconds);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatCurrency = (value: number | null | undefined) => {
    const n = value == null || Number.isNaN(value) ? 0 : value;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
  };

  const toEditValueString = (value: number | null | undefined) =>
    (value == null || Number.isNaN(value) ? 0 : value)
      .toFixed(2)
      .replace(".", ",");

  const resolveDraftIsPublic = (row: { is_public?: unknown; data?: DraftData | null }) => {
    if (typeof row.is_public === "boolean") return row.is_public;
    return Boolean(row.data?.isPublic);
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
        isPublic: draft.isPublic,
      } satisfies CreationItem;
    });

    if (piecesFilter === "finalizadas") return items.filter((item) => item.status === "finalizada");
    if (piecesFilter === "rascunhos") return items.filter((item) => item.status === "rascunho");
    return items;
  }, [drafts, piecesFilter]);

  useEffect(() => {
    if (!effectiveViewedUserId) {
      setDrafts([]);
      setDraftsLoading(false);
      setDraftsError(null);
      return;
    }

    let cancelled = false;

    const fetchDrafts = async () => {
      setDraftsLoading(true);
      setDraftsError(null);

      try {
        let data: any[] | null = null;
        let error: any = null;
        let publicPiecesBackendMissing = false;

        if (isOwnProfile) {
          const result = await supabase
            .from("project_drafts")
            .select("id, project_key, data, updated_at, is_public")
            .eq("user_id", effectiveViewedUserId)
            .order("updated_at", { ascending: false });
          data = result.data;
          error = result.error;

          // Compatibilidade com schema antigo ou cache sem is_public.
          if (error?.code === "42703" || error?.code === "PGRST204" || String(error?.message || "").includes("is_public")) {
            const fallback = await supabase
              .from("project_drafts")
              .select("id, project_key, data, updated_at")
              .eq("user_id", effectiveViewedUserId)
              .order("updated_at", { ascending: false });
            data = fallback.data;
            error = fallback.error;
          }
        } else {
          const rpcRows = await supabase.rpc("get_public_project_drafts", {
            target_user_id: effectiveViewedUserId,
            limit_count: 120,
          });

          data = (rpcRows.data as any[]) ?? null;
          error = rpcRows.error;

          // Fallback caso RPC não esteja criada no banco.
          if (error && String(error.message || "").includes("get_public_project_drafts")) {
            publicPiecesBackendMissing = true;
            const fallback = await supabase
              .from("project_drafts")
              .select("id, project_key, data, updated_at, is_public")
              .eq("user_id", effectiveViewedUserId)
              .eq("is_public", true)
              .order("updated_at", { ascending: false });
            data = fallback.data;
            error = fallback.error;
          }

          if (error?.code === "42703" || error?.code === "PGRST204" || String(error?.message || "").includes("is_public")) {
            // Sem coluna de visibilidade, evita expor peças privadas.
            publicPiecesBackendMissing = true;
            data = [];
            error = null;
          }
        }

        if (cancelled) return;

        if (error) {
          console.error("Erro ao carregar peças:", error);
          setDraftsError("Erro ao carregar peças.");
          setDrafts([]);
          return;
        }

        const mapped: DraftRecord[] = (data ?? []).map((row: any) => ({
          id: String(row.id),
          projectKey: String(row.project_key ?? ""),
          updatedAt: (row.updated_at ?? null) as string | null,
          data: (row.data ?? {}) as DraftData,
          isPublic: resolveDraftIsPublic(row),
        }));

        setDrafts(mapped);
        if (!isOwnProfile && publicPiecesBackendMissing) {
          setDraftsError("Peças públicas ainda não estão configuradas no banco. Execute os SQLs social_search_profiles.sql e draft_visibility.sql no Supabase.");
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro inesperado ao buscar peças:", err);
          setDraftsError("Erro inesperado ao carregar peças.");
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
  }, [effectiveViewedUserId, isOwnProfile]);

  useEffect(() => {
    if (!effectiveViewedUserId) {
      setGalleryItems([]);
      setGalleryError(null);
      setGalleryLoading(false);
      return;
    }

    let cancelled = false;

    const loadGallery = async () => {
      setGalleryLoading(true);
      setGalleryError(null);

      try {
        let visibilityRows: any[] | null = null;
        let visibilityError: any = null;

        if (!isOwnProfile && isLikelyUuid(effectiveViewedUserId)) {
          const rpcRows = await supabase.rpc("get_public_gallery_items", {
            target_user_id: effectiveViewedUserId,
            limit_count: 120,
          });
          if (!rpcRows.error) {
            visibilityRows = (rpcRows.data as any[]) ?? [];
          } else {
            visibilityError = rpcRows.error;
          }
        }

        if (!visibilityRows) {
          let visibilityQuery = supabase
            .from("gallery_visibility")
            .select("storage_path,is_public,design_value,design_name,updated_at")
            .eq("user_id", effectiveViewedUserId)
            .order("updated_at", { ascending: false });

          if (!isOwnProfile) {
            visibilityQuery = visibilityQuery.eq("is_public", true);
          }

          const result = await visibilityQuery;
          visibilityRows = result.data;
          visibilityError = result.error;

          // Se design_name ainda não existe na tabela (42703), faz fallback sem ela
          if (visibilityError?.code === "42703") {
            let fallbackQuery = supabase
              .from("gallery_visibility")
              .select("storage_path,is_public,design_value,updated_at")
              .eq("user_id", effectiveViewedUserId)
              .order("updated_at", { ascending: false });
            if (!isOwnProfile) {
              fallbackQuery = fallbackQuery.eq("is_public", true);
            }
            const fallback = await fallbackQuery;
            visibilityRows = fallback.data;
            visibilityError = fallback.error;
          }
        }

        if (cancelled) return;
        if (visibilityError && visibilityError.code !== "42P01") throw visibilityError;

        const visibilityMap = new Map<string, { isPublic: boolean; designValue: number; designName: string | null }>(
          (visibilityRows || []).map((row: any) => [
            String(row.storage_path),
            {
              isPublic: Boolean(row.is_public),
              designValue: row.design_value != null ? Number(row.design_value) : 0,
              designName: row.design_name ? String(row.design_name) : null,
            },
          ])
        );

        let items: GalleryItem[] = [];

        if (isOwnProfile) {
          const prefix = `${effectiveViewedUserId}/images`;
          const { data: files, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, {
            limit: 100,
          } as any);

          if (cancelled) return;
          if (error) throw error;

          const ordered = (files || []).slice().sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

          items = await Promise.all(
            ordered.map(async (file) => {
              const fullPath = `${prefix}/${file.name}`;
              const { data: signed } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(fullPath, 60 * 60 * 24 * 7);

              return {
                id: fullPath,
                previewUrl:
                  signed?.signedUrl ||
                  supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fullPath).data.publicUrl ||
                  "",
                originalName: file.name.replace(/^(\d{17})-/, ""),
                sortKey: file.name.slice(0, 17),
                isPublic: visibilityMap.get(fullPath)?.isPublic ?? false,
                designValue: visibilityMap.get(fullPath)?.designValue ?? 0,
                displayName: visibilityMap.get(fullPath)?.designName || file.name.replace(/^(\d{17})-/, ""),
              } satisfies GalleryItem;
            })
          );
        } else {
          const publicRows = (visibilityRows || []).filter((row: any) => Boolean(row.is_public));
          const paths = publicRows.map((row: any) => String(row.storage_path || "")).filter(Boolean);

          // Gera signed URLs em lote — funcionam mesmo em buckets privados
          let signedMap: Record<string, string> = {};
          if (paths.length > 0) {
            const { data: signedData } = await supabase.storage
              .from(STORAGE_BUCKET)
              .createSignedUrls(paths, 60 * 60 * 24 * 7);
            if (signedData) {
              for (const entry of signedData) {
                if (entry.signedUrl) signedMap[entry.path] = entry.signedUrl;
              }
            }
          }

          items = publicRows.map((row: any) => {
            const path = String(row.storage_path || "");
            const fileName = path.split("/").pop() || "design.png";
            const previewUrl =
              signedMap[path] ||
              supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl ||
              "";
            return {
              id: path,
              previewUrl,
              originalName: fileName.replace(/^(\d{17})-/, ""),
              sortKey: fileName.slice(0, 17),
              isPublic: true,
              designValue: row.design_value != null ? Number(row.design_value) : 0,
              displayName: row.design_name ? String(row.design_name) : fileName.replace(/^(\d{17})-/, ""),
            } satisfies GalleryItem;
          });
        }

        if (!cancelled) setGalleryItems(items.filter((item) => Boolean(item.previewUrl)));
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao carregar galeria do usuário:", err);
          setGalleryError("Erro ao carregar a galeria.");
          setGalleryItems([]);
        }
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    };

    void loadGallery();

    return () => {
      cancelled = true;
    };
  }, [effectiveViewedUserId, isOwnProfile]);

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
      let display: ViewUser = {
        id: effectiveViewedUserId,
        name: isOwnProfile
          ? ((authUser?.user_metadata as any)?.nickname ??
            (authUser?.user_metadata as any)?.name ??
            (authUser?.user_metadata as any)?.full_name ??
            "Usuário")
          : "Usuário",
        username: isOwnProfile ? ((authUser?.user_metadata as any)?.username || "") : "",
        avatar: "",
      };

      try {
        let prof: (SocialProfileRow & { full_name?: string | null; email?: string | null }) | null = null;

        if (isOwnProfile) {
          prof = (await getProfile()) as (SocialProfileRow & { full_name?: string | null; email?: string | null }) | null;
        } else {
          if (isLikelyUuid(effectiveViewedUserId)) {
            const rpcProfile = (await supabase
              .rpc("get_social_profile", { target_user_id: effectiveViewedUserId })
              .maybeSingle()).data as SocialProfileRow | null;
            if (rpcProfile) prof = rpcProfile;
          }

          if (!prof && viewedUsername) {
            const { data: rows } = await supabase.rpc("search_social_profiles", {
              search_term: viewedUsername,
              limit_count: 50,
            });
            const exact = ((rows ?? []) as SocialProfileRow[]).find(
              (row) => normalizeUsername(row.username) === viewedUsername,
            );
            if (exact) prof = exact;
          }

          if (!prof && isLikelyUuid(effectiveViewedUserId)) {
            const { data: rows } = await supabase.rpc("search_social_profiles", {
              search_term: null,
              limit_count: 200,
            });
            const byId = ((rows ?? []) as SocialProfileRow[]).find((row) => row.id === effectiveViewedUserId);
            if (byId) prof = byId;
          }
        }

        if (prof) {
          let avatarUrl = "";
          if ((prof as any).avatar_path) {
            const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(prof.avatar_path);
            avatarUrl = data.publicUrl;
          }

          display = {
            ...display,
            id: prof.id || display.id,
            name: (prof.nickname ?? (prof as any).full_name ?? display.name),
            username: prof.username || display.username,
            email: isOwnProfile ? ((prof as any).email ?? display.email) : undefined,
            avatar: avatarUrl,
            designsCount: Number((prof as any).designs_count ?? display.designsCount ?? 0),
            piecesCount: Number((prof as any).pieces_count ?? display.piecesCount ?? 0),
          };
        }
      } catch {
        /* silencioso */
      }

      // Prepara os campos de edição com os valores atuais
      if (isOwnProfile) {
        setForm({
          nickname: display.name || "",
          username: display.username || "",
        });
      }

      setUser(display);
    };
    load();
  }, [authUser, getProfile, isOwnProfile, viewedUsername, effectiveViewedUserId]);

  const togglePieceVisibility = async (itemId: string, nextIsPublic: boolean) => {
    if (!authUser?.id || !isOwnProfile) return;

    setTogglingPieceIds((prev) => ({ ...prev, [itemId]: true }));
    const previousDraft = drafts.find((d) => d.id === itemId) ?? null;
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === itemId
          ? { ...d, isPublic: nextIsPublic, data: { ...d.data, isPublic: nextIsPublic } }
          : d
      )
    );

    try {
      let error: any = null;

      const columnUpdate = await supabase
        .from("project_drafts")
        .update({ is_public: nextIsPublic })
        .eq("id", itemId);
      error = columnUpdate.error;

      // Fallback para bancos sem a coluna is_public: salva dentro do JSON data.
      if (error?.code === "PGRST204" || String(error?.message || "").includes("is_public")) {
        const fallbackData = {
          ...(previousDraft?.data ?? {}),
          isPublic: nextIsPublic,
        } satisfies DraftData;

        const fallbackUpdate = await supabase
          .from("project_drafts")
          .update({ data: fallbackData })
          .eq("id", itemId);
        error = fallbackUpdate.error;
      }

      if (error) throw error;
    } catch (err) {
      console.error("Erro ao atualizar visibilidade da peça:", err);
      if (previousDraft) {
        setDrafts((prev) =>
          prev.map((d) =>
            d.id === itemId
              ? {
                ...d,
                isPublic: previousDraft.isPublic,
                data: { ...d.data, isPublic: previousDraft.data?.isPublic ?? previousDraft.isPublic },
              }
              : d
          )
        );
      }
    } finally {
      setTogglingPieceIds((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const toggleGalleryVisibility = async (itemId: string, nextIsPublic: boolean) => {
    if (!authUser?.id || !isOwnProfile) return;

    setTogglingGalleryIds((prev) => ({ ...prev, [itemId]: true }));
    const previousItem = galleryItems.find((item) => item.id === itemId) ?? null;

    updateDesignLocal(itemId, { isPublic: nextIsPublic });

    try {
      const { error } = await supabase.from("gallery_visibility").upsert(
        {
          user_id: authUser.id,
          storage_path: itemId,
          is_public: nextIsPublic,
        },
        { onConflict: "user_id,storage_path" }
      );
      if (error) throw error;
    } catch (err) {
      console.error("Erro ao atualizar visibilidade do design:", err);
      if (previousItem) updateDesignLocal(itemId, { isPublic: previousItem.isPublic });
      setGalleryError("Não foi possível atualizar a visibilidade deste design.");
    } finally {
      setTogglingGalleryIds((prev) => ({ ...prev, [itemId]: false }));
    }
  };

  const closeSelectedDesign = () => {
    setSelectedDesign(null);
    setEditPanelOpen(false);
    setEditNameInput("");
    setEditValueInput("0,00");
  };

  const updateDesignLocal = (itemId: string, partial: Partial<GalleryItem>) => {
    setGalleryItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...partial } : item)));
    setSelectedDesign((prev) => (prev && prev.id === itemId ? { ...prev, ...partial } : prev));
  };

  const handleReplaceDesignImage: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0] ?? null;
    if (!file || !selectedDesign || !authUser?.id || !isOwnProfile) return;

    setReplacingDesign(true);
    try {
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(selectedDesign.id, file, { upsert: true, contentType: file.type || "image/png" });

      if (uploadError) throw uploadError;

      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(selectedDesign.id, 60 * 60 * 24 * 7);

      const previewUrl =
        signed?.signedUrl ||
        supabase.storage.from(STORAGE_BUCKET).getPublicUrl(selectedDesign.id).data.publicUrl ||
        selectedDesign.previewUrl;

      updateDesignLocal(selectedDesign.id, { previewUrl });
    } catch (err) {
      console.error("Erro ao substituir imagem do design:", err);
      setGalleryError("Não foi possível editar a imagem deste design.");
    } finally {
      setReplacingDesign(false);
      event.target.value = "";
    }
  };

  const openEditPanel = () => {
    if (!selectedDesign) return;
    setEditNameInput(selectedDesign.displayName);
    setEditValueInput(toEditValueString(selectedDesign.designValue));
    setEditPanelOpen(true);
  };

  const saveDesignEdit = async () => {
    if (!selectedDesign || !authUser?.id || !isOwnProfile) return;

    const normalized = editValueInput.replace(",", ".").trim();
    const parsed = normalized ? Number(normalized) : 0;
    if (normalized && (Number.isNaN(parsed) || parsed < 0)) {
      setGalleryError("Informe um valor válido para o design.");
      return;
    }

    setSavingDesignEdit(true);
    try {
      const { error } = await supabase.from("gallery_visibility").upsert(
        {
          user_id: authUser.id,
          storage_path: selectedDesign.id,
          is_public: selectedDesign.isPublic,
          design_value: parsed,
          design_name: editNameInput.trim() || null,
        },
        { onConflict: "user_id,storage_path" }
      );

      if (error) throw error;

      updateDesignLocal(selectedDesign.id, {
        designValue: parsed,
        displayName: editNameInput.trim() || selectedDesign.originalName,
      });
      setEditPanelOpen(false);
    } catch (err) {
      console.error("Erro ao salvar edição do design:", err);
      setGalleryError("Não foi possível salvar as alterações do design.");
    } finally {
      setSavingDesignEdit(false);
    }
  };

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
      try { await supabase.auth.updateUser({ data: { nickname: newNick } }); } catch { }

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
      try { await supabase.auth.updateUser({ data: { username: newUser } }); } catch { }

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
      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-8">
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
                  {isOwnProfile && (
                    <button
                      aria-label="Editar foto de perfil"
                      onClick={() => setOpenUpload(true)}
                      className="hidden group-hover:flex absolute inset-0 items-center justify-center rounded-full bg-black/40"
                      title="Editar foto"
                    >
                      <Pencil className="w-5 h-5 text-white" />
                    </button>
                  )}
                </div>

                <div>
                  {/* Linha do NICKNAME com lápis no hover */}
                  <div className="group flex items-center gap-2">
                    {!isOwnProfile || !editing.nickname ? (
                      <>
                        <h1 className="text-2xl font-semibold">{user.name}</h1>
                        {isOwnProfile && (
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
                        )}
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
                    {!isOwnProfile || !editing.username ? (
                      <>
                        <p className="text-gray-600 mb-1">@{user.username || "defina um usuário"}</p>
                        {isOwnProfile && (
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
                        )}
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
                  <div className="text-2xl font-bold text-purple-600">
                    {isOwnProfile ? creations.length : (user.designsCount ?? galleryItems.length)}
                  </div>
                  <div className="text-xs text-gray-500">{isOwnProfile ? "Criações" : "Designs públicos"}</div>
                </div>
                {!isOwnProfile && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{user.piecesCount ?? 0}</div>
                    <div className="text-xs text-gray-500">Peças públicas</div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* ===== Seções abaixo do banner (RESTauradas) ===== */}
        <Tabs defaultValue={isOwnProfile ? "creations" : "elements"} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-2">
            <TabsTrigger value="creations">{isOwnProfile ? "Minhas Peças" : "Peças"}</TabsTrigger>
            <TabsTrigger value="elements">Designs</TabsTrigger>
          </TabsList>

          {/* Minhas Peças */}
          <TabsContent value="creations" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{isOwnProfile ? "Minhas Peças" : "Peças públicas"}</h2>
              {isOwnProfile && <div className="flex gap-2">
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
              </div>}
            </div>

            {draftsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <Card key={idx} className="border border-border bg-background shadow-none rounded-none">
                    <CardHeader className="p-3 pb-2 border-b border-border">
                      <div className="h-4 w-24 rounded-none bg-muted animate-pulse" />
                      <div className="mt-1 h-3 w-16 rounded-none bg-muted animate-pulse" />
                    </CardHeader>
                    <CardContent className="p-3 pt-3">
                      <div className="aspect-[3/4] w-full overflow-hidden rounded-none border border-border bg-muted mb-3 animate-pulse" />
                      <div className="flex gap-1.5">
                        <div className="h-8 w-full rounded-none bg-muted animate-pulse" />
                        <div className="h-8 w-full rounded-none bg-muted animate-pulse" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : draftsError ? (
              <div className="rounded-none border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive font-bold uppercase tracking-widest">
                {draftsError}
              </div>
            ) : creations.length === 0 ? (
              <div className="rounded-none border border-border bg-background px-4 py-8 text-sm text-muted-foreground text-center font-bold uppercase tracking-widest">
                {isOwnProfile ? "Nenhum rascunho salvo ainda." : "Nenhuma peça pública encontrada."}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {(() => {
                  // Lógica de windowing: só renderiza 8 cards centrais
                  const total = creations.length;
                  if (total <= 8) {
                    return creations.map((item) => (
                      <Card key={item.id} className="border border-border bg-background shadow-none transition-none hover:border-foreground rounded-none filter-none">
                        <CardHeader className="p-3 pb-2 border-b border-border">
                          <div className="flex items-center justify-between gap-1">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest truncate">{item.title}</CardTitle>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                            {item.date ? `Criado em ${item.date}` : ""}
                          </p>
                        </CardHeader>
                        <CardContent className="p-3 pt-3">
                          <div className="aspect-[3/4] w-full overflow-hidden rounded-none border border-border bg-background mb-3">
                            <Canvas3DViewer
                              baseColor={item.baseColor || "#ffffff"}
                              externalDecals={item.externalDecals || []}
                              interactive={false}
                              selectionOverride={item.selection}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="flex gap-1.5">
                            {isOwnProfile ? (
                              <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs rounded-none uppercase tracking-widest font-bold"
                              onClick={() => item.draft && handleEditDraft(item.draft)}
                              disabled={!item.draft}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              className="w-full text-xs rounded-none uppercase tracking-widest font-bold bg-foreground text-background"
                              onClick={() => item.draft && handleProduceDraft(item.draft)}
                              disabled={!item.draft}
                            >
                              Produzir
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="flex-none rounded-none"
                              onClick={() => void togglePieceVisibility(item.id, !item.isPublic)}
                              disabled={Boolean(togglingPieceIds[item.id])}
                              title={item.isPublic ? "Público" : "Não público"}
                              aria-label={item.isPublic ? "Definir como não público" : "Definir como público"}
                            >
                              {togglingPieceIds[item.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <span className={`relative inline-flex transition-transform duration-500 ${item.isPublic ? "rotate-180" : "rotate-0"}`}>
                                  <Earth className="h-4 w-4" />
                                  {!item.isPublic && (
                                    <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                                  )}
                                </span>
                              )}
                            </Button>
                              </>
                            ) : (
                              <div className="w-full text-center text-xs text-muted-foreground font-bold uppercase tracking-widest py-2 border border-border rounded-none">
                                Peça pública
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ));
                  }
                  // Se houver mais de 8, só renderiza os 8 centrais
                  // Calcula o centro da viewport (pode ser ajustado para scroll real)
                  const [start, end] = (() => {
                    // Para simplificação, centraliza na metade da lista
                    const center = Math.floor(total / 2);
                    let s = center - 4;
                    let e = center + 4;
                    if (s < 0) { s = 0; e = 8; }
                    if (e > total) { e = total; s = total - 8; }
                    return [s, e];
                  })();
                  return creations.map((item, idx) => {
                    const isActive = idx >= start && idx < end;
                    return (
                      <Card key={item.id} className="border border-border bg-background shadow-none transition-none hover:border-foreground rounded-none filter-none">
                        <CardHeader className="p-3 pb-2 border-b border-border">
                          <div className="flex items-center justify-between gap-1">
                            <CardTitle className="text-sm font-bold uppercase tracking-widest truncate">{item.title}</CardTitle>
                            {getStatusBadge(item.status)}
                          </div>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest">
                            {item.date ? `Criado em ${item.date}` : ""}
                          </p>
                        </CardHeader>
                        <CardContent className="p-3 pt-3">
                          <div className="aspect-[3/4] w-full overflow-hidden rounded-none border border-border bg-background mb-3">
                            {isActive ? (
                              <Canvas3DViewer
                                baseColor={item.baseColor || "#ffffff"}
                                externalDecals={item.externalDecals || []}
                                interactive={false}
                                selectionOverride={item.selection}
                                className="h-full w-full"
                              />
                            ) : (
                              <div className="h-full w-full bg-muted flex items-center justify-center text-xs text-muted-foreground select-none uppercase tracking-widest font-bold">
                                Pré-visualização 3D
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1.5">
                            {isOwnProfile ? (
                              <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-xs rounded-none uppercase tracking-widest font-bold"
                              onClick={() => item.draft && handleEditDraft(item.draft)}
                              disabled={!item.draft}
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              className="w-full text-xs rounded-none uppercase tracking-widest font-bold bg-foreground text-background"
                              onClick={() => item.draft && handleProduceDraft(item.draft)}
                              disabled={!item.draft}
                            >
                              Produzir
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="flex-none rounded-none"
                              onClick={() => void togglePieceVisibility(item.id, !item.isPublic)}
                              disabled={Boolean(togglingPieceIds[item.id])}
                              title={item.isPublic ? "Público" : "Não público"}
                              aria-label={item.isPublic ? "Definir como não público" : "Definir como público"}
                            >
                              {togglingPieceIds[item.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <span className={`relative inline-flex transition-transform duration-500 ${item.isPublic ? "rotate-180" : "rotate-0"}`}>
                                  <Earth className="h-4 w-4" />
                                  {!item.isPublic && (
                                    <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                                  )}
                                </span>
                              )}
                            </Button>
                              </>
                            ) : (
                              <div className="w-full text-center text-xs text-muted-foreground font-bold uppercase tracking-widest py-2 border border-border rounded-none">
                                Peça pública
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })()}
              </div>
            )}
            </TabsContent>

          {/* Designs */}
          <TabsContent value="elements" className="mt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">{isOwnProfile ? "Designs" : "Designs públicos"}</h2>
            </div>

            {galleryLoading ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
                Carregando designs da galeria...
              </div>
            ) : galleryError ? (
              <div className="rounded-xl border border-dashed border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">
                {galleryError}
              </div>
            ) : galleryItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center text-sm text-muted-foreground">
                {isOwnProfile ? "Nenhum item encontrado na sua galeria." : "Nenhum design público encontrado."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {galleryItems.map((item) => (
                  <Card
                    key={item.id}
                    className="shadow-lg hover:shadow-xl transition-shadow overflow-hidden cursor-pointer"
                    onClick={() => setSelectedDesign(item)}
                  >
                    <CardContent className="p-0">
                      <div>
                        <div className="aspect-square w-full overflow-hidden bg-muted">
                          <img
                            src={item.previewUrl}
                            alt={item.originalName}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </div>

                      </div>

                      <div className="p-4">
                        <CardTitle className="text-lg break-all">{item.originalName}</CardTitle>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {formatGalleryDate(item.sortKey) ? `Adicionado em ${formatGalleryDate(item.sortKey)}` : "Item da galeria"}
                        </p>
                        {isOwnProfile && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.isPublic ? "Visível para todos" : "Somente você"}
                          </p>
                        )}
                      </div>
                      {isOwnProfile && (
                        <div className="flex justify-end px-4 pb-4">
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            className="bg-background/90"
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggleGalleryVisibility(item.id, !item.isPublic);
                            }}
                            disabled={Boolean(togglingGalleryIds[item.id])}
                            title={item.isPublic ? "Público" : "Não público"}
                            aria-label={item.isPublic ? "Definir como não público" : "Definir como público"}
                          >
                            {togglingGalleryIds[item.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <span className={`relative inline-flex transition-transform duration-500 ${item.isPublic ? "rotate-180" : "rotate-0"}`}>
                                <Earth className="h-4 w-4" />
                                {!item.isPublic && (
                                  <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                                )}
                              </span>
                            )}
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={Boolean(selectedDesign)} onOpenChange={(open) => (!open ? closeSelectedDesign() : undefined)}>
        <DialogContent className="max-w-6xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Detalhes do design</DialogTitle>
          </DialogHeader>

          {selectedDesign && (
            <div className="relative">
              {isOwnProfile && (
                <div className="absolute right-0 top-0 z-10">
                  <Button variant="ghost" size="icon" aria-label="Editar design" onClick={openEditPanel}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <input
                ref={replaceDesignInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleReplaceDesignImage}
              />

              <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                <div className="rounded-lg border bg-muted/20 p-2">
                  <div className="max-h-[70vh] overflow-auto rounded-md bg-black/5 flex items-center justify-center">
                    <img
                      src={selectedDesign.previewUrl}
                      alt={selectedDesign.displayName}
                      className="max-h-[68vh] w-auto object-contain"
                    />
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Nome</p>
                    <p className="font-semibold break-all">{selectedDesign.displayName}</p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Data</p>
                    <p className="font-medium">
                      {formatGalleryDate(selectedDesign.sortKey) || "Data indisponível"}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-muted-foreground">Valor</p>
                    <p className="font-medium">{formatCurrency(selectedDesign.designValue)}</p>
                  </div>

                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground mb-2">Visibilidade</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="bg-background/90"
                      onClick={() => void toggleGalleryVisibility(selectedDesign.id, !selectedDesign.isPublic)}
                      disabled={!isOwnProfile || Boolean(togglingGalleryIds[selectedDesign.id])}
                      title={selectedDesign.isPublic ? "Público" : "Não público"}
                      aria-label={selectedDesign.isPublic ? "Definir como não público" : "Definir como público"}
                    >
                      {togglingGalleryIds[selectedDesign.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <span className={`relative inline-flex transition-transform duration-500 ${selectedDesign.isPublic ? "rotate-180" : "rotate-0"}`}>
                          <Earth className="h-4 w-4" />
                          {!selectedDesign.isPublic && (
                            <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                          )}
                        </span>
                      )}
                    </Button>
                  </div>

                  {replacingDesign && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Atualizando imagem...
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editPanelOpen} onOpenChange={(open) => { if (!open) setEditPanelOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar design</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={editNameInput}
                onChange={(event) => setEditNameInput(event.target.value)}
                placeholder="Nome do design"
                disabled={savingDesignEdit}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input
                value={editValueInput}
                onChange={(event) => setEditValueInput(event.target.value)}
                placeholder="0,00"
                inputMode="decimal"
                disabled={savingDesignEdit}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPanelOpen(false)} disabled={savingDesignEdit}>
              Cancelar
            </Button>
            <Button onClick={saveDesignEdit} disabled={savingDesignEdit}>
              {savingDesignEdit ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de upload (inalterado) */}
      {isOwnProfile && (
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
      )}
    </div>
  );
};

export default Profile;
