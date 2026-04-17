import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_BUCKET } from "@/lib/supabaseClient";
import { AVATAR_BUCKET } from "@/lib/constants/storage";
import SocialPost, { SocialPostData } from "./SocialPost";
import type { ExternalDecalData } from "@/types/decals";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SocialProfile = {
  id?: string | null;
  user_id?: string | null;
  username: string;
  nickname: string;
  avatar_path: string | null;
  designs_count: number;
  pieces_count: number;
};

type GalleryItem = {
  storage_path: string;
  design_name: string | null;
  design_value: number;
  updated_at: string;
};

type ProjectDraft = {
  id: string;
  project_key: string;
  data: {
    projectName?: string;
    baseColor?: string;
    part?: string | null;
    type?: string | null;
    subtype?: string | null;
    canvasTabs?: Array<{ id: string; name: string; type: "2d" | "3d" }>;
    tabDecalPreviews?: Record<string, string>;
    tabDecalPlacements?: Record<string, any>;
    tabVisibility?: Record<string, boolean>;
  };
  updated_at: string;
};

interface SocialFeedProps {
  limit?: number;
}

function getProfileId(profile: SocialProfile): string {
  return String(profile.id ?? profile.user_id ?? "").trim();
}

function readSignedUrl(entry: any): string {
  return String(entry?.signedUrl ?? entry?.signedURL ?? "").trim();
}

function isUsableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  if (!raw) return false;
  if (raw.startsWith("data:image/")) return true;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return true;
  if (raw.startsWith("blob:")) return true;
  return false;
}

function fallbackPiecePreview(baseColor?: string): string {
  const safeColor = encodeURIComponent(baseColor || "#e0e0e0");
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='${safeColor}' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23666' font-size='24'%3EPeça sem preview%3C/text%3E%3C/svg%3E`;
}

function extractPiecePreview(data: ProjectDraft["data"]): string {
  const tabPreviews = data?.tabDecalPreviews || {};
  const tabPreview = Object.values(tabPreviews).find(isUsableImageUrl);
  if (tabPreview) return tabPreview;

  const snapshots = (data as any)?.canvasSnapshots;
  if (snapshots && typeof snapshots === "object") {
    for (const value of Object.values(snapshots as Record<string, unknown>)) {
      if (isUsableImageUrl(value)) return value;
      if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (isUsableImageUrl(obj.previewUrl)) return obj.previewUrl;
        if (isUsableImageUrl(obj.dataUrl)) return obj.dataUrl;
      }
    }
  }

  return fallbackPiecePreview(data?.baseColor);
}

function buildPieceExternalDecals(data: ProjectDraft["data"]): ExternalDecalData[] {
  const tabs = data?.canvasTabs ?? [];
  const previews = data?.tabDecalPreviews ?? {};
  const visibility = data?.tabVisibility ?? {};
  const placements = data?.tabDecalPlacements ?? {};

  const fromTabs = tabs
    .filter((tab) => tab.type === "2d" && visibility[tab.id] && previews[tab.id])
    .map((tab) => ({
      id: tab.id,
      label: tab.name,
      dataUrl: previews[tab.id] as string,
      transform: placements[tab.id] ?? null,
    } satisfies ExternalDecalData));

  if (fromTabs.length > 0) return fromTabs;

  return Object.entries(previews)
    .filter(([, url]) => Boolean(url))
    .map(([id, url]) => ({
      id,
      label: id,
      dataUrl: url as string,
      transform: placements[id] ?? null,
    } satisfies ExternalDecalData));
}

export default function SocialFeed({ limit = 100 }: SocialFeedProps) {
  const [posts, setPosts] = useState<SocialPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  const getAvatarUrl = useCallback((avatarPath: string | null): string | undefined => {
    if (!avatarPath) return undefined;
    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
    return data.publicUrl;
  }, []);

  const formatDate = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleDateString("pt-BR");
  };

  const getProjectDisplayName = (projectName: string | undefined): string => {
    return projectName && projectName.trim() ? projectName : "Sem nome";
  };

  const loadPublicPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Busca todos os perfis com designs ou peças públicas
      const { data: profiles, error: profilesError } = await supabase.rpc(
        "search_social_profiles",
        {
          search_term: null,
          limit_count: 200,
        }
      );

      if (profilesError) throw profilesError;

      const validProfiles = (profiles as SocialProfile[])?.filter(
        (p) => (p.designs_count > 0 || p.pieces_count > 0) && Boolean(getProfileId(p))
      ) || [];

      console.log(`[SocialFeed] Encontrados ${validProfiles.length} perfis com conteúdo`);

      const allPosts: SocialPostData[] = [];
      const debugInfo: Record<string, { designs: number; pieces: number }> = {};
      for (const profile of validProfiles) {
        try {
          const profileId = getProfileId(profile);

          // Carrega designs públicos
          const { data: designItems, error: designsError } = await supabase.rpc(
            "get_public_gallery_items",
            {
              target_user_id: profileId,
              limit_count: 50,
            }
          );

          if (!designsError && designItems) {
            const designRows = designItems as GalleryItem[];
            const designPaths = designRows.map((item) => item.storage_path).filter(Boolean);

            let signedByPath: Record<string, string> = {};
            if (designPaths.length > 0) {
              const { data: signedData } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrls(designPaths, 60 * 60 * 24 * 7);
              if (signedData) {
                for (const entry of signedData as any[]) {
                  const signed = readSignedUrl(entry);
                  if (signed) signedByPath[String(entry.path)] = signed;
                }
              }
            }

            const designPosts = designRows
              .map((item): SocialPostData => ({
                id: item.storage_path,
                type: "design",
                previewUrl:
                  signedByPath[item.storage_path] ||
                  supabase.storage.from(STORAGE_BUCKET).getPublicUrl(item.storage_path).data.publicUrl ||
                  "",
                title: item.design_name || "Design sem nome",
                date: formatDate(item.updated_at),
                designValue: item.design_value,
                userId: profileId,
                username: profile.username,
                nickname: profile.nickname,
                userAvatar: getAvatarUrl(profile.avatar_path),
              }))
              .filter((post) => {
                // Filtra posts com previewUrl válida
                if (!post.previewUrl || !post.previewUrl.trim()) {
                  console.warn(`[SocialFeed] Design ${post.id} sem previewUrl válida`);
                  return false;
                }
                return true;
              });
            debugInfo[profile.nickname] = debugInfo[profile.nickname] || { designs: 0, pieces: 0 };
            debugInfo[profile.nickname].designs = designPosts.length;
            console.log(`[SocialFeed] Perfil ${profile.nickname}: ${designPosts.length} designs públicos carregados`);
            allPosts.push(...designPosts);
          } else if (designsError) {
            console.warn(`[SocialFeed] Erro ao carregar designs de ${profile.nickname}:`, designsError);
          }

          // Carrega peças públicas (project_drafts)
          const { data: pieceItems, error: piecesError } = await supabase.rpc(
            "get_public_project_drafts",
            {
              target_user_id: profileId,
              limit_count: 50,
            }
          );

          if (!piecesError && pieceItems) {
            console.log(`[SocialFeed] RPC retornou ${(pieceItems as any[]).length} peças para ${profile.nickname}`);
            
            const piecePosts = (pieceItems as ProjectDraft[])
              .map((item): SocialPostData => {
                const data = item.data || {};
                const firstPreview = extractPiecePreview(data);

                return {
                  id: item.id,
                  type: "piece",
                  previewUrl: firstPreview,
                  title: getProjectDisplayName(data.projectName),
                  date: formatDate(item.updated_at),
                  userId: profileId,
                  username: profile.username,
                  nickname: profile.nickname,
                  userAvatar: getAvatarUrl(profile.avatar_path),
                  pieceBaseColor: data.baseColor || "#ffffff",
                  pieceSelection: {
                    part: data.part ?? null,
                    type: data.type ?? null,
                    subtype: data.subtype ?? null,
                  },
                  pieceExternalDecals: buildPieceExternalDecals(data),
                };
              });
            
            debugInfo[profile.nickname] = debugInfo[profile.nickname] || { designs: 0, pieces: 0 };
            debugInfo[profile.nickname].pieces = piecePosts.length;
            console.log(`[SocialFeed] Perfil ${profile.nickname}: ${piecePosts.length} peças públicas carregadas`);
            allPosts.push(...piecePosts);
          } else if (piecesError) {
            console.warn(`[SocialFeed] Erro ao carregar peças de ${profile.nickname}:`, piecesError);
          }
        } catch (err) {
          console.warn(`Erro ao carregar posts do usuário ${getProfileId(profile)}:`, err);
        }
      }

      // Ordena por data decrescente
      allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      console.log(`[SocialFeed] Total de posts antes da limitação: ${allPosts.length}`);
      
      // Remove duplicatas por ID (em caso de erro de sincronização)
      const seen = new Set<string>();
      const dedupedPosts = allPosts.filter((post) => {
        if (seen.has(post.id)) {
          console.warn(`[SocialFeed] Post duplicado removido: ${post.id}`);
          return false;
        }
        seen.add(post.id);
        return true;
      });

      console.log(`[SocialFeed] Posts após remover duplicatas: ${dedupedPosts.length}`);

      // Limita ao número especificado
      const finalPosts = dedupedPosts.slice(0, limit);
      console.log(`[SocialFeed] Posts exibidos (após limite de ${limit}): ${finalPosts.length}`);
      console.log(`[SocialFeed] Detalhes: ${finalPosts.map(p => `${p.type}(${p.id.substring(0, 8)}... - ${p.title})`).join(", ")}`);
      console.log("[SocialFeed] Resumo por perfil:", debugInfo);
      setPosts(finalPosts);
    } catch (err) {
      console.error("Erro ao carregar feed social:", err);
      setError("Não foi possível carregar o feed social. Tente novamente mais tarde.");
    } finally {
      setLoading(false);
    }
  }, [limit, getAvatarUrl]);

  useEffect(() => {
    loadPublicPosts();
  }, [loadPublicPosts]);

  const handleLike = (postId: string) => {
    setLikedPosts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleLoadMore = async () => {
    setLoadingMore(true);
    // Aqui você pode implementar paginação se necessário
    setLoadingMore(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Carregando feed...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={loadPublicPosts} variant="outline">
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <p className="text-muted-foreground">
            Nenhum design ou peça pública encontrada no momento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
        {posts.map((post) => (
          <SocialPost
            key={post.id}
            post={post}
            isLiked={likedPosts.has(post.id)}
            onLike={handleLike}
          />
        ))}
      </div>

      {posts.length >= limit && (
        <div className="flex justify-center mt-8">
          <Button
            onClick={handleLoadMore}
            disabled={loadingMore}
            variant="outline"
          >
            {loadingMore ? "Carregando..." : "Carregar mais"}
          </Button>
        </div>
      )}
    </div>
  );
}
