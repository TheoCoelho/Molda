import React, { useEffect, useRef, useState } from "react";
import { FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/api/backend";
import { ensureBackendAccessToken } from "@/lib/backendAuth";

type Props = {
  onImageInsert?: (
    src: string,
    opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }
  ) => void;
};

type MyGalleryItem = {
  id: string;
  title: string;
  image_url: string;
  is_public: boolean;
  created_at: string;
};

export default function UploadGallery({ onImageInsert }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<MyGalleryItem[]>([]);
  const [isPublicUpload, setIsPublicUpload] = useState(false);

  const loadGallery = async () => {
    const auth = await ensureBackendAccessToken();
    if (!auth?.token) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{ items: MyGalleryItem[] }>("/gallery/my-items?limit=100", {
        token: auth.token,
      });
      setItems(response.items ?? []);
    } catch (error) {
      console.error("[UploadGallery] load", error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadGallery();
  }, [user?.id]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail as
        | {
            id?: string;
            previewUrl?: string;
            originalName?: string;
            isPublic?: boolean;
          }
        | undefined;

      if (!detail?.id || !detail?.previewUrl) return;

      setItems((prev) => [
        {
          id: detail.id,
          title: detail.originalName || "Imagem",
          image_url: detail.previewUrl,
          is_public: Boolean(detail.isPublic),
          created_at: new Date().toISOString(),
        },
        ...prev.filter((item) => item.id !== detail.id),
      ]);
    };

    window.addEventListener("uploadGallery:newItem", handler as EventListener);
    return () => window.removeEventListener("uploadGallery:newItem", handler as EventListener);
  }, []);

  const uploadFile = async (file: File) => {
    const auth = await ensureBackendAccessToken();
    if (!auth?.token) {
      toast.error("Faca login para enviar imagens.");
      return;
    }

    setUploading(true);
    try {
      const uploadMeta = await apiRequest<{ objectKey: string; uploadUrl: string }>("/gallery/upload-url", {
        method: "POST",
        token: auth.token,
        body: {
          filename: file.name,
          contentType: file.type || "image/png",
        },
      });

      const put = await fetch(uploadMeta.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!put.ok) {
        throw new Error("Falha ao enviar arquivo para o storage.");
      }

      const confirmed = await apiRequest<MyGalleryItem>("/gallery/confirm-upload", {
        method: "POST",
        token: auth.token,
        body: {
          objectKey: uploadMeta.objectKey,
          title: file.name.replace(/\.[^/.]+$/, "") || "Design",
          isPublic: isPublicUpload,
        },
      });

      setItems((prev) => [confirmed, ...prev]);
      setIsPublicUpload(false);
      toast.success("Imagem enviada com sucesso.");
    } catch (error: any) {
      console.error("[UploadGallery] upload", error);
      toast.error(error?.message || "Falha ao enviar imagem.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadFile(file);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Upload de Imagens</h3>

      {!user && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Faca login para enviar e visualizar suas imagens.
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="text-sm text-muted-foreground flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublicUpload}
            onChange={(event) => setIsPublicUpload(event.target.checked)}
            className="h-4 w-4"
            disabled={!user || uploading}
          />
          Tornar publico
        </label>
        <Button onClick={() => fileInputRef.current?.click()} disabled={!user || uploading}>
          {uploading ? "Enviando..." : "Enviar imagem"}
        </Button>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={onFileChosen} />

      <div className="grid grid-cols-2 gap-2">
        {loading ? (
          <div className="col-span-2 flex items-center justify-center py-6 text-sm text-gray-600 dark:text-gray-400">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Carregando sua galeria...
          </div>
        ) : items.length === 0 ? (
          <div className="col-span-2 text-center text-xs text-gray-500 dark:text-gray-400 py-2">
            Nenhuma imagem ainda.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="relative group aspect-square overflow-hidden rounded-lg border border-gray-200 dark:border-border bg-white cursor-pointer"
              onClick={() => onImageInsert?.(item.image_url, { meta: { galleryItemId: item.id } })}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", item.image_url);
                event.dataTransfer.setData(
                  "application/x-molda-gallery-meta",
                  JSON.stringify({ galleryItemId: item.id })
                );
              }}
            >
              <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
              <div className="absolute inset-x-0 bottom-0 p-1 text-[10px] text-white bg-black/55 truncate">
                {item.title || "Imagem"}
              </div>
              {item.is_public ? (
                <span className="absolute top-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  Publico
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <FileImage className="w-3 h-3" />
        Clique ou arraste uma imagem para inserir no editor.
      </div>
    </div>
  );
}
