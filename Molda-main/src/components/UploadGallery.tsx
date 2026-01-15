// src/components/upload/UploadGallery.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, STORAGE_BUCKET } from "../lib/supabaseClient";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { Button } from "../components/ui/button";
import { Slider } from "../components/ui/slider";
import { Switch } from "../components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../components/ui/dialog";

import { FileImage, Loader2 } from "lucide-react";
import { toast } from "sonner";


type GalleryItem = {
  id: string;           // caminho completo no Storage
  previewUrl: string;   // URL (assinada ou pública)
  originalName: string;
  sortKey: string;      // 17 dígitos do timestamp no nome (string)
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

const tsPrefix = () =>
  new Date().toISOString().replace(/[-:.TZ]/g, ""); // ex: 20250909162004123

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

type Props = {
  onImageInsert?: (src: string, opts?: { x?: number; y?: number }) => void;
};

export default function UploadGallery({ onImageInsert }: Props) {
  // ===== Supabase client (pode ser null se envs ausentes)
  const supabase: SupabaseClient | null = getSupabase();

  // ===== Auth
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!mounted) return;
      if (error) console.warn("[auth.getUser]", error.message);
      setUser(data.user ?? null);
      setAuthLoading(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub?.subscription?.unsubscribe();
  }, [supabase]);

  // ===== Upload & edição
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [sepia, setSepia] = useState(0);
  const [grayscale, setGrayscale] = useState(0);
  const [hue, setHue] = useState(0);
  const [shadowOn, setShadowOn] = useState(false);
  const [shadowBlur, setShadowBlur] = useState(12);
  const [shadowOpacity, setShadowOpacity] = useState(0.35);

  const filterCss = useMemo(
    () =>
      `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${sepia}%) grayscale(${grayscale}%) hue-rotate(${hue}deg)`,
    [brightness, contrast, saturation, sepia, grayscale, hue]
  );

  const resetFilters = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setSepia(0);
    setGrayscale(0);
    setHue(0);
    setShadowOn(false);
    setShadowBlur(12);
    setShadowOpacity(0.35);
  };

  // ===== Galeria
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setSelectedFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setIsUploadOpen(true);
  };

  // Exporta imagem com filtros aplicados
  const exportWithFiltersToDataUrl = async (): Promise<string> =>
    new Promise((resolve, reject) => {
      if (!previewUrl) return reject(new Error("Nenhuma imagem selecionada"));
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("Canvas 2D não disponível"));

          // sombra (desenho inicial com alpha e blur)
          if (shadowOn && shadowOpacity > 0 && shadowBlur > 0) {
            ctx.save();
            ctx.globalAlpha = shadowOpacity;
            ctx.shadowColor = "rgba(0,0,0,1)";
            ctx.shadowBlur = shadowBlur;
            ctx.shadowOffsetX = Math.round(Math.max(2, shadowBlur / 3));
            ctx.shadowOffsetY = Math.round(Math.max(2, shadowBlur / 3));
            ctx.drawImage(img, 0, 0);
            ctx.restore();
          }

          // filtros CSS-like
          try {
            (ctx as any).filter = filterCss;
          } catch {}

          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("Falha ao carregar a prévia"));
      img.src = previewUrl;
    });

  // Upload para o Storage
  const uploadToSupabase = async (dataUrl: string) => {
    if (!supabase) throw new Error("Supabase não configurado.");
    if (!user) throw new Error("É necessário estar logado para enviar imagens.");

    const base = slugify((selectedFile?.name || "imagem").replace(/\.[a-zA-Z0-9]+$/, ""));
    const filename = `${tsPrefix()}-${base}.png`;
    const path = `${user.id}/images/${filename}`;

    const blob = await dataUrlToBlob(dataUrl);

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, blob, { upsert: false, contentType: "image/png" });

    if (uploadErr) throw uploadErr;

    // URL assinada (bucket privado)
    const { data: signed, error: signErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 dias

    if (signErr) throw signErr;

    const previewUrl =
      signed?.signedUrl ||
      supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;

    if (!previewUrl) throw new Error("Não foi possível obter URL de visualização.");

    return { path, previewUrl, originalName: `${base}.png` };
  };

  // Carrega galeria do usuário
  const loadGallery = async () => {
    if (!supabase || !user) return;
    setLoadingGallery(true);
    try {
      const prefix = `${user.id}/images`;
      const { data: files, error } = await supabase.storage.from(STORAGE_BUCKET).list(prefix, {
        limit: 100,
      } as any);
      if (error) throw error;

      // Ordena por nome desc (nomes começam com timestamp)
      const ordered = (files || []).slice().sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));

      const items: GalleryItem[] = [];
      for (const f of ordered) {
        const fullPath = `${prefix}/${f.name}`;

        let previewUrl = "";
        const { data: signed } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrl(fullPath, 60 * 60 * 24 * 7);
        previewUrl =
          signed?.signedUrl ||
          supabase.storage.from(STORAGE_BUCKET).getPublicUrl(fullPath).data.publicUrl ||
          "";

        items.push({
          id: fullPath,
          previewUrl,
          originalName: f.name.replace(/^(\d{17})-/, ""),
          sortKey: f.name.slice(0, 17),
        });
      }

      setGallery(items);
    } catch (e) {
      console.error("[loadGallery]", e);
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    if (user) loadGallery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  // Permite que outras partes do app insiram itens na galeria após upload (ex.: salvar PNG do Editor2D)
  useEffect(() => {
    const handler = (ev: Event) => {
      if (!user) return;
      const detail = (ev as CustomEvent)?.detail as
        | {
            id?: string;
            previewUrl?: string;
            originalName?: string;
            sortKey?: string;
            userId?: string;
          }
        | undefined;

      if (!detail?.id || !detail?.previewUrl) return;
      if (detail.userId && detail.userId !== user.id) return;

      const item: GalleryItem = {
        id: detail.id,
        previewUrl: detail.previewUrl,
        originalName: detail.originalName || "imagem.png",
        sortKey: detail.sortKey || "",
      };

      setGallery((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
    };

    window.addEventListener("uploadGallery:newItem", handler as EventListener);
    return () => window.removeEventListener("uploadGallery:newItem", handler as EventListener);
  }, [user]);

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      const dataUrl = await exportWithFiltersToDataUrl();
      const saved = await uploadToSupabase(dataUrl);
      setGallery((prev) => [
        {
          id: saved.path,
          previewUrl: saved.previewUrl,
          originalName: saved.originalName,
          sortKey: saved.path.split("/").pop()!.slice(0, 17),
        },
        ...prev,
      ]);

      setIsUploadOpen(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);
      resetFilters();
} catch (err: any) {
  console.error("[handleConfirm]", err);
  toast.error(err?.message || "Falha ao enviar imagem.");
} finally {
  setIsSaving(false);
}

  };

  const handleCloseDialog = () => {
    setIsUploadOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    resetFilters();
  };

  const envMissing = !supabase;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">Upload de Imagens</h3>

      {envMissing && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
          Supabase não configurado. Verifique suas variáveis no <code>.env</code> e reinicie o servidor.
        </div>
      )}

      {!envMissing && !authLoading && !user && (
        <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
          Você precisa estar logado para enviar e visualizar suas imagens.
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => !envMissing && user && openFilePicker()}
        onKeyDown={(e) => !envMissing && user && (e.key === "Enter" || e.key === " ") && openFilePicker()}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
          envMissing || !user
            ? "border-gray-200 bg-gray-50 cursor-not-allowed"
            : "border-gray-300 hover:border-purple-400"
        }`}
        aria-disabled={envMissing || !user}
      >
        <FileImage className="w-12 h-12 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600">Clique para fazer upload</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={onFileChosen}
      />

      {/* Galeria 2 colunas */}
      <div className="grid grid-cols-2 gap-2">
        {envMissing ? (
          <div className="col-span-2 text-center text-xs text-gray-500 py-2">
            Configure o Supabase para carregar a galeria.
          </div>
        ) : loadingGallery ? (
          <div className="col-span-2 flex items-center justify-center py-6 text-sm text-gray-600">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Carregando sua galeria...
          </div>
        ) : !user ? (
          <div className="col-span-2 text-center text-xs text-gray-500 py-2">
            Faça login para ver sua galeria.
          </div>
        ) : gallery.length === 0 ? (
          <div className="col-span-2 text-center text-xs text-gray-500 py-2">
            Nenhuma imagem ainda. Faça o primeiro upload.
          </div>
        ) : (
          gallery.map((item) => (
            <div
              key={item.id}
              className="relative aspect-square overflow-hidden rounded-md border bg-white cursor-pointer"
              draggable
              onClick={() => onImageInsert?.(item.previewUrl)}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.previewUrl);
              }}
            >
              <img
                src={item.previewUrl}
                alt={item.originalName}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))
        )}
      </div>

      {/* Dialog de edição/preview */}
      <Dialog open={isUploadOpen} onOpenChange={(v) => (v ? setIsUploadOpen(v) : handleCloseDialog())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pré-visualizar & editar</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4">
            <div className="w-full max-h-[60vh] overflow-auto rounded-lg border bg-black/5 p-2 flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Prévia"
                  style={{ filter: filterCss }}
                  className="max-h-[56vh] w-auto object-contain"
                />
              ) : (
                <div className="text-gray-500 text-sm">Selecione uma imagem…</div>
              )}
            </div>

            {/* Ferramentas horizontais */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Brilho</span>
                <Slider value={[brightness]} min={0} max={200} step={1}
                        onValueChange={(v) => setBrightness(v[0] ?? 100)} />
                <span className="w-12 text-xs text-right">{brightness}%</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Contraste</span>
                <Slider value={[contrast]} min={0} max={200} step={1}
                        onValueChange={(v) => setContrast(v[0] ?? 100)} />
                <span className="w-12 text-xs text-right">{contrast}%</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Saturação</span>
                <Slider value={[saturation]} min={0} max={200} step={1}
                        onValueChange={(v) => setSaturation(v[0] ?? 100)} />
                <span className="w-12 text-xs text-right">{saturation}%</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Sépia</span>
                <Slider value={[sepia]} min={0} max={100} step={1}
                        onValueChange={(v) => setSepia(v[0] ?? 0)} />
                <span className="w-12 text-xs text-right">{sepia}%</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Escala de cinza</span>
                <Slider value={[grayscale]} min={0} max={100} step={1}
                        onValueChange={(v) => setGrayscale(v[0] ?? 0)} />
                <span className="w-12 text-xs text-right">{grayscale}%</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Matiz (°)</span>
                <Slider value={[hue]} min={0} max={360} step={1}
                        onValueChange={(v) => setHue(v[0] ?? 0)} />
                <span className="w-12 text-xs text-right">{hue}°</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="w-28 text-sm">Sombra</span>
                <Switch checked={shadowOn} onCheckedChange={setShadowOn} />
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-xs">Intensidade</span>
                  <Slider value={[shadowBlur]} min={0} max={40} step={1}
                          onValueChange={(v) => setShadowBlur(v[0] ?? 12)} disabled={!shadowOn} />
                  <span className="text-xs">Opacidade</span>
                  <Slider value={[Math.round(shadowOpacity * 100)]} min={0} max={100} step={1}
                          onValueChange={(v) => setShadowOpacity((v[0] ?? 35) / 100)} disabled={!shadowOn} />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={resetFilters}>Redefinir</Button>
            <DialogClose asChild>
              <Button variant="ghost" onClick={handleCloseDialog}>Cancelar</Button>
            </DialogClose>
            <Button onClick={handleConfirm} disabled={isSaving || !user || !supabase}>
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
