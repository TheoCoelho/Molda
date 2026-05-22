import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SocialPost, { SocialPostData } from "./SocialPost";
import { apiRequest } from "@/api/backend";

type PublicGalleryItem = {
  id: string;
  user_id: string;
  title: string;
  image_url: string;
  created_at: string;
};

type PublicProfile = {
  user_id: string;
  username: string;
  nickname: string;
  avatar_url?: string | null;
};

interface SocialFeedProps {
  limit?: number;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("pt-BR");
}

export default function SocialFeed({ limit = 100 }: SocialFeedProps) {
  const [posts, setPosts] = useState<SocialPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const loadPublicPosts = async () => {
      setLoading(true);
      setError(null);

      try {
        const gallery = await apiRequest<{ items: PublicGalleryItem[] }>(
          `/gallery/public?limit=${Math.min(limit, 100)}`
        );

        const items = gallery.items ?? [];
        if (!items.length) {
          if (!cancelled) setPosts([]);
          return;
        }

        const uniqueUserIds = Array.from(new Set(items.map((item) => item.user_id)));
        const profiles = await Promise.all(
          uniqueUserIds.map(async (userId) => {
            try {
              const profile = await apiRequest<PublicProfile>(`/profiles/public/${userId}`);
              return [userId, profile] as const;
            } catch {
              return [userId, null] as const;
            }
          })
        );

        const profileByUserId = new Map(profiles);

        const mapped: SocialPostData[] = items.map((item) => {
          const profile = profileByUserId.get(item.user_id);
          return {
            id: item.id,
            type: "design",
            previewUrl: item.image_url,
            title: item.title || "Design sem nome",
            date: formatDate(item.created_at),
            userId: item.user_id,
            username: profile?.username || "usuario",
            nickname: profile?.nickname || "Criador",
            userAvatar: profile?.avatar_url || undefined,
          };
        });

        if (!cancelled) {
          setPosts(mapped.slice(0, limit));
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Erro ao carregar feed social:", err);
          setError("Nao foi possivel carregar o feed social. Tente novamente mais tarde.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadPublicPosts();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  const handleLike = (postId: string) => {
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
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
          <Button onClick={() => window.location.reload()} variant="outline">
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
          <p className="text-muted-foreground">Nenhum design publico encontrado no momento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6">
      {posts.map((post) => (
        <SocialPost key={post.id} post={post} isLiked={likedPosts.has(post.id)} onLike={handleLike} />
      ))}
    </div>
  );
}
