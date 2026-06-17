import { useEffect, useMemo, useState, type ChangeEventHandler } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth, type Profile as OwnProfile } from "@/contexts/AuthContext";
import { apiRequest, getApiBaseUrl } from "@/api/backend";
import { ensureBackendAccessToken } from "@/lib/backendAuth";
import { Loader2, Pencil } from "lucide-react";

type PublicProfile = {
  user_id: string;
  username: string;
  nickname: string;
  avatar_url?: string | null;
  bio?: string | null;
  designs_count?: number;
  drafts_count?: number;
};

type GalleryItem = {
  id: string;
  title: string;
  image_url: string;
  is_public: boolean;
  created_at: string;
};

type DraftCanvasTab = {
  id: string;
  name: string;
  type: "2d" | "3d";
};

type DraftData = {
  projectName?: string;
  projectKey?: string;
  draftKey?: string;
  draftId?: string;
  part?: string | null;
  type?: string | null;
  subtype?: string | null;
  activeCanvasTab?: string;
  canvasTabs?: DraftCanvasTab[];
  canvasSnapshots?: Record<string, string>;
  tabDecalPreviews?: Record<string, string>;
  isPublic?: boolean;
};

type DraftRecord = {
  id: string;
  projectKey: string;
  updatedAt: string | null;
  data: DraftData;
};

const getAvatarFallback = (name: string) => {
  const safe = (name || "U").trim();
  const parts = safe.split(" ").filter(Boolean);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : (safe[0] || "U").toUpperCase();
};

const formatJoinedAt = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

const getDraftPreview = (draft: DraftRecord) => {
  const snapshots = draft.data.canvasSnapshots ?? {};
  const previews = draft.data.tabDecalPreviews ?? {};
  const activeTab = draft.data.activeCanvasTab;

  if (activeTab && snapshots[activeTab]) return snapshots[activeTab];
  if (activeTab && previews[activeTab]) return previews[activeTab];

  const firstSnapshot = Object.values(snapshots).find(Boolean);
  if (firstSnapshot) return firstSnapshot;

  return Object.values(previews).find(Boolean) || "";
};

const getDraftTitle = (draft: DraftRecord) => {
  return draft.data.projectName || draft.projectKey || `Peça ${draft.id.slice(0, 8)}`;
};

export default function Profile() {
  const navigate = useNavigate();
  const { user, getProfile, updateOwnProfile } = useAuth();
  const [searchParams] = useSearchParams();

  const requestedUserId = searchParams.get("user") || "";
  const isOwnView = !requestedUserId || requestedUserId === user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [openUpload, setOpenUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState({ nickname: false, username: false });
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState<boolean | null>(null);

  const [nickname, setNickname] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  const visibleProfile = useMemo(() => {
    if (isOwnView) return ownProfile;
    if (!publicProfile) return null;
    return {
      id: publicProfile.user_id,
      user_id: publicProfile.user_id,
      nickname: publicProfile.nickname,
      username: publicProfile.username,
      bio: publicProfile.bio,
      avatar_path: publicProfile.avatar_url,
      is_public: true,
    } as Partial<OwnProfile>;
  }, [isOwnView, ownProfile, publicProfile]);

  const visibleName = visibleProfile?.nickname || visibleProfile?.username || "Usuário";
  const joinedAt = formatJoinedAt(isOwnView ? ownProfile?.created_at : null);
  const avatarSrc = (visibleProfile as Partial<OwnProfile> | null)?.avatar_path || undefined;
  const piecesCount = isOwnView ? drafts.length : Number(publicProfile?.drafts_count ?? 0);
  const designsCount = gallery.length;

  const stats = useMemo(() => {
    const creationsCount = isOwnView
      ? drafts.length + gallery.length
      : Number(publicProfile?.designs_count ?? gallery.length);

    return [
      { label: "Criações", value: creationsCount },
      { label: "Peças", value: piecesCount },
      { label: "Designs", value: designsCount },
    ];
  }, [drafts.length, gallery.length, isOwnView, piecesCount, designsCount, publicProfile?.designs_count]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        if (isOwnView) {
          const profile = await getProfile();
          if (!profile) {
            throw new Error("Perfil nao encontrado.");
          }

          if (!cancelled) {
            setOwnProfile(profile);
            setNickname(profile.nickname || "");
            setUsername(profile.username || "");
            setBio(profile.bio || "");
            setIsPublic(Boolean(profile.is_public));
          }

          const auth = await ensureBackendAccessToken();
          if (!auth?.token) {
            if (!cancelled) {
              setGallery([]);
              setDrafts([]);
            }
            return;
          }

          const [myItems, draftsResponse] = await Promise.all([
            apiRequest<{ items: GalleryItem[] }>("/gallery/my-items?limit=100", { token: auth.token }),
            apiRequest<{
              items: Array<{
                id: string;
                updated_at?: string | null;
                design_data?: DraftData;
              }>;
            }>("/drafts?limit=100", { token: auth.token }),
          ]);

          if (!cancelled) {
            setGallery(myItems.items ?? []);
            setDrafts(
              (draftsResponse.items ?? []).map((row) => {
                const designData = row.design_data ?? {};
                const projectKey = designData.draftKey || designData.projectKey || row.id;
                return {
                  id: row.id,
                  projectKey,
                  updatedAt: row.updated_at ?? null,
                  data: {
                    ...designData,
                    draftId: row.id,
                    draftKey: projectKey,
                    projectKey,
                  },
                } satisfies DraftRecord;
              }),
            );
          }
          return;
        }

        const [profileResponse, publicItems] = await Promise.all([
          apiRequest<PublicProfile>(`/profiles/public/${requestedUserId}`),
          apiRequest<{ items: GalleryItem[] }>(`/gallery/public?userId=${encodeURIComponent(requestedUserId)}&limit=100`),
        ]);

        if (!cancelled) {
          setPublicProfile(profileResponse);
          setGallery(publicItems.items ?? []);
          setDrafts([]);
        }
      } catch (err) {
        console.error("[Profile] load", err);
        if (!cancelled) {
          setError("Nao foi possivel carregar este perfil.");
          setGallery([]);
          setDrafts([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [getProfile, isOwnView, requestedUserId]);

  const checkUsernameAvailability = async (candidate: string) => {
    const value = candidate.trim();
    if (!value || value === ownProfile?.username) {
      setUsernameTaken(false);
      return true;
    }

    setCheckingUsername(true);
    try {
      const result = await apiRequest<{ username_taken?: boolean }>("/auth/check-availability", {
        method: "POST",
        body: { username: value },
      });
      const taken = Boolean(result.username_taken);
      setUsernameTaken(taken);
      return !taken;
    } catch (err) {
      console.error("[Profile] check username", err);
      return true;
    } finally {
      setCheckingUsername(false);
    }
  };

  const refreshOwnProfile = async () => {
    const refreshed = await getProfile();
    setOwnProfile(refreshed);
    return refreshed;
  };

  const handleSave = async () => {
    if (!isOwnView) return;
    setSaving(true);
    setError(null);

    try {
      const usernameAvailable = await checkUsernameAvailability(username);
      if (!usernameAvailable) {
        setError("Este username já está em uso.");
        return;
      }

      const { error: updateError } = await updateOwnProfile({
        nickname: nickname.trim(),
        username: username.trim(),
        bio: bio.trim(),
        is_public: isPublic,
      });

      if (updateError) {
        throw updateError;
      }

      const refreshed = await refreshOwnProfile();
      setNickname(refreshed?.nickname || "");
      setUsername(refreshed?.username || "");
      setBio(refreshed?.bio || "");
      setEditing({ nickname: false, username: false });
      setUsernameTaken(false);
    } catch (err) {
      console.error("[Profile] update", err);
      setError("Nao foi possivel salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const onPickFile: ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : "");
  };

  const handleSaveAvatar = async () => {
    if (!selectedFile || !isOwnView) return;
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Tamanho máximo do avatar: 5MB.");
      return;
    }

    setAvatarUploading(true);
    setError(null);

    try {
      const auth = await ensureBackendAccessToken();
      if (!auth?.token) {
        throw new Error("Sessão expirada. Faça login novamente.");
      }

      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch(`${getApiBaseUrl()}/profiles/me/avatar`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.token}`,
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message || payload?.error || "Nao foi possivel enviar o avatar.";
        throw new Error(message);
      }

      const avatarPath = payload?.avatar_path ?? payload?.profile?.avatar_path ?? null;
      if (avatarPath) {
        await updateOwnProfile({ avatar_path: avatarPath });
      }

      await refreshOwnProfile();
      setOpenUpload(false);
      setSelectedFile(null);
      setPreviewUrl("");
    } catch (err: any) {
      console.error("[Profile] upload avatar", err);
      setError(err?.message || "Nao foi possivel atualizar a imagem de perfil.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const persistDraftToLocal = (draft: DraftRecord) => {
    const payload: DraftData = {
      ...draft.data,
      draftId: draft.id,
      draftKey: draft.projectKey,
      projectKey: draft.projectKey,
    };
    localStorage.setItem("currentProject", JSON.stringify(payload));
    return payload;
  };

  const handleEditDraft = (draft: DraftRecord) => {
    const payload = persistDraftToLocal(draft);
    const params = new URLSearchParams();
    if (payload.part) params.set("part", payload.part);
    if (payload.type) params.set("type", payload.type);
    if (payload.subtype) params.set("subtype", payload.subtype);

    navigate(`/creation${params.toString() ? `?${params.toString()}` : ""}`, {
      state: {
        part: payload.part ?? undefined,
        type: payload.type ?? undefined,
        subtype: payload.subtype ?? undefined,
        restoreDraft: true,
        draftId: draft.id,
        draftKey: draft.projectKey,
      },
    });
  };

  const handleProduceDraft = (draft: DraftRecord) => {
    persistDraftToLocal(draft);
    navigate("/finalize");
  };

  return (
    <div className="min-h-screen bg-[#030814] text-white">
      <Header />
      <div className="h-20" />
      <main className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/70">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Carregando perfil...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-[28px] border-[4px] border-[#5b86ff] bg-[#050a17] p-4 shadow-[0_0_0_1px_rgba(91,134,255,0.08),0_18px_70px_rgba(0,0,0,0.45)] sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-[#dbe2f7] bg-[#e7e7e7] text-black shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] sm:h-24 sm:w-24"
                    onClick={() => isOwnView && setOpenUpload(true)}
                    aria-label="Alterar foto de perfil"
                  >
                    <Avatar className="h-full w-full border-0 bg-transparent">
                      <AvatarImage src={previewUrl || avatarSrc} alt={visibleName} />
                      <AvatarFallback className="bg-transparent text-[2.4rem] text-black">
                        {getAvatarFallback(visibleName)}
                      </AvatarFallback>
                    </Avatar>
                    {isOwnView ? (
                      <span className="absolute inset-0 hidden items-center justify-center bg-black/25 text-white group-hover:flex">
                        <Pencil className="h-5 w-5" />
                      </span>
                    ) : null}
                  </button>

                  <div className="space-y-1 text-left">
                    <h1 className="text-xl font-medium text-white sm:text-2xl">{visibleProfile?.nickname || "(Nome)"}</h1>
                    <p className="text-lg text-white/90">{visibleProfile?.username ? `(${visibleProfile.username})` : "(username)"}</p>
                  </div>
                </div>

                <div className="flex min-w-[120px] flex-col items-end leading-none text-white">
                  <div className="text-6xl font-light sm:text-7xl">{piecesCount}</div>
                  <div className="mt-1 text-sm sm:text-base">peças</div>
                  <div className="text-sm sm:text-base">criadas</div>
                </div>
              </div>

              {isOwnView ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-[#5b86ff] bg-[#07101f] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-white/55">Bio</label>
                      <Textarea
                        value={bio}
                        onChange={(event) => setBio(event.target.value)}
                        rows={3}
                        className="border-[#5b86ff]/40 bg-[#050a17] text-white placeholder:text-white/35"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-white/75">
                      <input
                        type="checkbox"
                        checked={isPublic}
                        onChange={(event) => setIsPublic(event.target.checked)}
                      />
                      Perfil público
                    </label>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button
                        variant="outline"
                        className="border-[#5b86ff] bg-transparent text-white hover:bg-[#5b86ff]/10 hover:text-white"
                        onClick={() => setOpenUpload(true)}
                      >
                        Foto
                      </Button>
                      <Button
                        className="bg-[#5b86ff] text-white hover:bg-[#7297ff]"
                        onClick={handleSave}
                        disabled={saving || checkingUsername}
                      >
                        {saving ? "Salvando..." : "Salvar perfil"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-10">
              <Tabs defaultValue="designs" className="space-y-0">
                <TabsList className="flex h-auto justify-center gap-3 bg-transparent p-0">
                  <TabsTrigger
                    value="designs"
                    className="rounded-t-2xl border-4 border-transparent px-10 py-2 text-lg text-white/80 data-[state=active]:border-[#5b86ff] data-[state=active]:border-b-[#050a17] data-[state=active]:bg-[#050a17] data-[state=active]:text-white"
                  >
                    Meus designs
                  </TabsTrigger>
                  <TabsTrigger
                    value="creations"
                    className="rounded-t-2xl border-4 border-transparent px-10 py-2 text-lg text-white/80 data-[state=active]:border-[#5b86ff] data-[state=active]:border-b-[#050a17] data-[state=active]:bg-[#050a17] data-[state=active]:text-white"
                  >
                    Minhas peças
                  </TabsTrigger>
                </TabsList>

                <div className="rounded-[28px] rounded-tl-none border-[4px] border-[#5b86ff] bg-[#050a17] p-4 sm:p-6">
                  <TabsContent value="designs" className="mt-0 space-y-0">
                    {gallery.length === 0 ? (
                      <div className="rounded-2xl border-2 border-[#5b86ff] bg-[#050a17] px-4 py-10 text-center text-white/65">
                        {isOwnView ? "Nenhum design encontrado." : "Nenhum design público encontrado."}
                      </div>
                    ) : (
                      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                        {gallery.map((item) => (
                          <div
                            key={item.id}
                            className="relative aspect-square overflow-hidden rounded-2xl border-4 border-[#5b86ff] bg-[#040814] p-3"
                          >
                            <div className="absolute left-3 top-3 z-10 h-8 w-8 rounded-full border-2 border-[#5b86ff] bg-[#d9d9d9] text-black shadow-sm">
                              <Avatar className="h-full w-full bg-transparent">
                                <AvatarFallback className="bg-transparent text-sm text-black">
                                  {getAvatarFallback(visibleName)}
                                </AvatarFallback>
                              </Avatar>
                            </div>
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.title || "Design"}
                                className="h-full w-full rounded-[18px] object-contain object-center"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center rounded-[18px] bg-[#09101f] text-white/35">
                                Preview indisponível
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="creations" className="mt-0 space-y-0">
                    {drafts.length === 0 ? (
                      <div className="rounded-2xl border-2 border-[#5b86ff] bg-[#050a17] px-4 py-10 text-center text-white/65">
                        {isOwnView ? "Você ainda não tem peças salvas." : "Nenhuma peça pública encontrada."}
                      </div>
                    ) : (
                      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-2">
                        {drafts.map((draft) => {
                          const preview = getDraftPreview(draft);
                          return (
                            <div
                              key={draft.id}
                              className="relative aspect-square overflow-hidden rounded-2xl border-4 border-[#5b86ff] bg-[#040814] p-3"
                            >
                              <div className="absolute left-3 top-3 z-10 h-8 w-8 rounded-full border-2 border-[#5b86ff] bg-[#d9d9d9] text-black shadow-sm">
                                <Avatar className="h-full w-full bg-transparent">
                                  <AvatarFallback className="bg-transparent text-sm text-black">
                                    {getAvatarFallback(visibleName)}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                              {preview ? (
                                <img
                                  src={preview}
                                  alt={getDraftTitle(draft)}
                                  className="h-full w-full rounded-[18px] object-contain object-center"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center rounded-[18px] bg-[#09101f] text-white/35">
                                  Preview indisponível
                                </div>
                              )}

                              <div className="mt-3 flex items-center justify-between gap-3 px-1 text-sm text-white/80">
                                <span className="truncate">{getDraftTitle(draft)}</span>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    className="h-8 border-[#5b86ff] bg-transparent px-3 text-xs text-white hover:bg-[#5b86ff]/10 hover:text-white"
                                    onClick={() => handleEditDraft(draft)}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    className="h-8 bg-[#5b86ff] px-3 text-xs text-white hover:bg-[#7297ff]"
                                    onClick={() => handleProduceDraft(draft)}
                                  >
                                    Produzir
                                  </Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </>
        )}
      </main>

      <Dialog open={openUpload} onOpenChange={setOpenUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar foto de perfil</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-center">
              <Avatar className="h-28 w-28">
                <AvatarImage src={previewUrl || avatarSrc} alt={visibleName} />
                <AvatarFallback>{getAvatarFallback(visibleName)}</AvatarFallback>
              </Avatar>
            </div>

            <Input type="file" accept="image/*" onChange={onPickFile} disabled={avatarUploading} />
            <p className="text-xs text-muted-foreground">Escolha uma imagem de até 5MB.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenUpload(false)} disabled={avatarUploading}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAvatar} disabled={!selectedFile || avatarUploading}>
              {avatarUploading ? "Enviando..." : "Salvar avatar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
