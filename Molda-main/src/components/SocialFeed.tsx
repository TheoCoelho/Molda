import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_BUCKET } from "@/lib/supabaseClient";
import { AVATAR_BUCKET } from "@/lib/constants/storage";
import SocialPost, { SocialPostData } from "./SocialPost";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type SocialProfile = {
  id: string;
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

  const getPreviewUrl = useCallback((storagePath: string): string => {
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
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
        (p) => (p.designs_count > 0 || p.pieces_count > 0) && p.id
      ) || [];

      console.log(`[SocialFeed] Encontrados ${validProfiles.length} perfis com conteúdo`);

      const allPosts: SocialPostData[] = [];
      const debugInfo: Record<string, { designs: number; pieces: number }> = {};
      for (const profile of validProfiles) {
        try {
          // Carrega designs públicos
          const { data: designItems, error: designsError } = await supabase.rpc(
            "get_public_gallery_items",
            {
              target_user_id: profile.id,
              limit_count: 50,
            }
          );

          if (!designsError && designItems) {
            const designPosts = (designItems as GalleryItem[])
              .map((item): SocialPostData => ({
                id: item.storage_path,
                type: "design",
                previewUrl: getPreviewUrl(item.storage_path),
                title: item.design_name || "Design sem nome",
                date: formatDate(item.updated_at),
                designValue: item.design_value,
                userId: profile.id,
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
              target_user_id: profile.id,
              limit_count: 50,
            }
          );

          if (!piecesError && pieceItems) {
            console.log(`[SocialFeed] RPC retornou ${(pieceItems as any[]).length} peças para ${profile.nickname}`);
            
            const piecePosts = (pieceItems as ProjectDraft[])
              .map((item, idx): SocialPostData | null => {
                // Tenta obter a primeira preview de decal disponível
                const data = item.data || {};
                const tabPreviews = data.tabDecalPreviews || {};
                const canvasSnapshots = (data as any).canvasSnapshots || {};
                
                // Prioridade: canvasSnapshots > tabDecalPreviews
                let firstPreview = Object.values(canvasSnapshots)[0] as string || 
                                   Object.values(tabPreviews)[0] as string || "";

                // Se não tem preview, tenta usar baseColor para criar um placeholder
                if (!firstPreview || !firstPreview.trim()) {
                  const baseColor = data.baseColor || "#e0e0e0";
                  // Cria um canvas SVG com a cor base e um ícone
                  firstPreview = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect fill='${encodeURIComponent(baseColor)}' width='400' height='400'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23666' font-size='24'%3EPeça sem preview%3C/text%3E%3C/svg%3E`;
                  console.warn(`[SocialFeed] Peça ${item.id} sem preview - usando cor base ${data.baseColor}`);
                }

                return {
                  id: item.id,
                  type: "piece",
                  previewUrl: firstPreview,
                  title: getProjectDisplayName(data.projectName),
                  date: formatDate(item.updated_at),
                  userId: profile.id,
                  username: profile.username,
                  nickname: profile.nickname,
                  userAvatar: getAvatarUrl(profile.avatar_path),
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
          console.warn(`Erro ao carregar posts do usuário ${profile.id}:`, err);
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
  }, [limit, getAvatarUrl, getPreviewUrl]);

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
