import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth, type Profile as OwnProfile } from "@/contexts/AuthContext";
import { apiRequest } from "@/api/backend";
import { ensureBackendAccessToken } from "@/lib/backendAuth";
import { Loader2 } from "lucide-react";

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

export default function Profile() {
  const { user, getProfile, updateOwnProfile } = useAuth();
  const [searchParams] = useSearchParams();

  const requestedUserId = searchParams.get("user") || "";
  const isOwnView = !requestedUserId || requestedUserId === user?.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ownProfile, setOwnProfile] = useState<OwnProfile | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [error, setError] = useState<string | null>(null);

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
      avatar_url: publicProfile.avatar_url,
      is_public: true,
    } as Partial<OwnProfile>;
  }, [isOwnView, ownProfile, publicProfile]);

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
          if (auth?.token) {
            const myItems = await apiRequest<{ items: GalleryItem[] }>("/gallery/my-items?limit=100", {
              token: auth.token,
            });
            if (!cancelled) {
              setGallery(myItems.items ?? []);
            }
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
        }
      } catch (err) {
        console.error("[Profile] load", err);
        if (!cancelled) {
          setError("Nao foi possivel carregar este perfil.");
          setGallery([]);
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
  }, [isOwnView, requestedUserId, getProfile]);

  const handleSave = async () => {
    if (!isOwnView) return;
    setSaving(true);
    try {
      const { error: updateError } = await updateOwnProfile({
        nickname,
        username,
        bio,
        is_public: isPublic,
      });

      if (updateError) {
        throw updateError;
      }

      const refreshed = await getProfile();
      setOwnProfile(refreshed);
    } catch (err) {
      console.error("[Profile] update", err);
      setError("Nao foi possivel salvar o perfil.");
    } finally {
      setSaving(false);
    }
  };

  const initials = (visibleProfile?.nickname || visibleProfile?.username || "U")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main>
      <Header />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 xl:px-16 2xl:px-24 py-8 space-y-8">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Carregando perfil...
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : (
          <>
            <div className="rounded-2xl border p-6 grid gap-6 md:grid-cols-[120px_1fr]">
              <Avatar className="w-28 h-28">
                <AvatarImage src={(visibleProfile as any)?.avatar_url || undefined} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="space-y-4">
                {isOwnView ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Nickname</label>
                        <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Username</label>
                        <Input value={username} onChange={(e) => setUsername(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Bio</label>
                      <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} />
                    </div>
                    <label className="text-sm text-muted-foreground flex items-center gap-2">
                      <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                      Perfil publico
                    </label>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? "Salvando..." : "Salvar perfil"}
                    </Button>
                  </>
                ) : (
                  <>
                    <h1 className="text-2xl font-semibold">{visibleProfile?.nickname || "Criador"}</h1>
                    <p className="text-sm text-muted-foreground">@{visibleProfile?.username || "usuario"}</p>
                    <p className="text-sm">{(visibleProfile as any)?.bio || "Sem bio."}</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Galeria</h2>
              {gallery.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {gallery.map((item) => (
                    <div key={item.id} className="rounded-xl border overflow-hidden bg-muted/20">
                      <img src={item.image_url} alt={item.title} className="w-full aspect-square object-cover" />
                      <div className="p-2 text-xs">
                        <p className="font-medium truncate">{item.title || "Design"}</p>
                        <p className="text-muted-foreground">{new Date(item.created_at).toLocaleDateString("pt-BR")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
