import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Canvas3DViewer from "@/components/Canvas3DViewer";
import type { ExternalDecalData } from "@/types/decals";
import { Heart, MessageCircle, Share2, Eye } from "lucide-react";
import { useState } from "react";

export type SocialPostData = {
  id: string;
  type: "design" | "piece";
  previewUrl: string;
  title: string;
  date: string;
  designValue?: number;
  
  // User info
  userId: string;
  username: string;
  nickname: string;
  userAvatar?: string;

  pieceBaseColor?: string;
  pieceSelection?: {
    part?: string | null;
    type?: string | null;
    subtype?: string | null;
  };
  pieceExternalDecals?: ExternalDecalData[];
};

interface SocialPostProps {
  post: SocialPostData;
  isLiked?: boolean;
  onLike?: (postId: string) => void;
}

export default function SocialPost({ post, isLiked = false, onLike }: SocialPostProps) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);

  const handleUserClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const params = new URLSearchParams();
    params.set("user", post.userId);
    params.set("username", post.username);
    navigate(`/profile?${params.toString()}`);
  };

  const getInitials = (nickname: string) => {
    return (nickname || "U")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatCurrency = (value: number | undefined) => {
    if (value === undefined) return null;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      {/* Header com usuário */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <button
            onClick={handleUserClick}
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <Avatar className="h-10 w-10">
              {post.userAvatar && <AvatarImage src={post.userAvatar} alt={post.nickname} />}
              <AvatarFallback>{getInitials(post.nickname)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-left">
              <p className="font-semibold text-sm">{post.nickname || "Usuário"}</p>
              <p className="text-xs text-muted-foreground">@{post.username}</p>
            </div>
          </button>
          <span className="text-xs text-muted-foreground">{post.date}</span>
        </div>
      </CardHeader>

      {/* Imagem/Preview */}
      <CardContent className="p-0">
        <div
          className="relative bg-muted overflow-hidden cursor-pointer"
          style={{ aspectRatio: "1 / 1" }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {post.type === "piece" ? (
            <Canvas3DViewer
              className="w-full h-full"
              baseColor={post.pieceBaseColor || "#ffffff"}
              selectionOverride={post.pieceSelection}
              externalDecals={post.pieceExternalDecals || []}
              interactive={false}
            />
          ) : (
            <img
              src={post.previewUrl}
              alt={post.title}
              className="w-full h-full object-cover hover:scale-105 transition-transform"
            />
          )}

          {/* Overlay com detalhes ao hover */}
          {isHovered && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-4">
              <div className="text-center">
                <Eye className="w-8 h-8 text-white mx-auto mb-2" />
              </div>
            </div>
          )}

          {/* Badge com tipo */}
          <Badge className="absolute top-2 right-2" variant={post.type === "design" ? "default" : "secondary"}>
            {post.type === "design" ? "Design" : "Peça"}
          </Badge>

          {/* Valor do design */}
          {post.designValue !== undefined && post.designValue > 0 && (
            <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-semibold">
              {formatCurrency(post.designValue)}
            </div>
          )}
        </div>
      </CardContent>

      {/* Title e Actions */}
      <div className="p-4">
        <h3 className="font-semibold text-sm mb-3 line-clamp-2">{post.title}</h3>

        {/* Action buttons */}
        <div className="flex justify-between text-muted-foreground">
          <button className="flex items-center gap-2 hover:text-primary transition-colors group">
            <Heart
              className={`w-5 h-5 transition-colors ${isLiked ? "fill-red-500 text-red-500" : "group-hover:text-red-500"}`}
              onClick={() => onLike?.(post.id)}
            />
            <span className="text-xs">0</span>
          </button>
          <button className="flex items-center gap-2 hover:text-primary transition-colors">
            <MessageCircle className="w-5 h-5" />
            <span className="text-xs">0</span>
          </button>
          <button className="flex items-center gap-2 hover:text-primary transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </Card>
  );
}
