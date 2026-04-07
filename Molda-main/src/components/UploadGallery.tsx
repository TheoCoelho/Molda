// src/components/upload/UploadGallery.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, STORAGE_BUCKET } from "../lib/supabaseClient";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "../components/ui/dialog";

import { Earth, FileImage, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";


type GalleryItem = {
  id: string;           // caminho completo no Storage
  previewUrl: string;   // URL (assinada ou pública)
  originalName: string;
  sortKey: string;      // 17 dígitos do timestamp no nome (string)
  isPublic: boolean;
  groupId: string;
  isVariant: boolean;
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

const createGroupId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const toSafeGroupId = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const parseStoredFilename = (filename: string) => {
  const extMatch = filename.match(/(\.[a-zA-Z0-9]+)$/);
  const ext = extMatch?.[1] || ".png";
  const withoutExt = filename.replace(/\.[a-zA-Z0-9]+$/, "");
  const tsMatch = withoutExt.match(/^(\d{17})-(.+)$/);
  const sortKey = tsMatch?.[1] || "";
  const rest = tsMatch?.[2] || withoutExt;
  const groupMatch = rest.match(/^(.*)__g-([a-z0-9-]+)__(o|v)$/i);

  if (groupMatch) {
    return {
      cleanName: `${groupMatch[1]}${ext}`,
      sortKey,
      groupId: groupMatch[2],
      isVariant: groupMatch[3].toLowerCase() === "v",
    };
  }

  return {
    cleanName: tsMatch ? `${rest}${ext}` : filename,
    sortKey,
    groupId: "",
    isVariant: false,
  };
};

const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

type Props = {
  onImageInsert?: (
    src: string,
    opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }
  ) => void;
};

// ─── SVG border path for variant group (L-shape when N is odd) ───────────────
function computeVariantBorderPath(
  gridW: number,
  N: number,
  gap: number,
  strokeW: number,
  r: number,
  margin: number   // space outside each cell edge
): { path: string; svgW: number; svgH: number } {
  const g = gap;
  const m = margin;
  const s = strokeW / 2;  // stroke centre must be >= s from SVG edge
  const cellW = (gridW - g) / 2;
  const cellH = cellW; // aspect-square
  const totalRows = Math.ceil(N / 2);
  const gridH = totalRows * cellH + (totalRows - 1) * g;

  // SVG is larger than the grid on every side by `m`
  const svgW = gridW + 2 * m;
  const svgH = gridH + 2 * m;

  // Even or single → simple rounded rectangle
  if (N % 2 === 0 || N <= 1) {
    const path =
      `M ${s + r},${s} H ${svgW - s - r} A ${r},${r} 0 0,1 ${svgW - s},${s + r} ` +
      `V ${svgH - s - r} A ${r},${r} 0 0,1 ${svgW - s - r},${svgH - s} ` +
      `H ${s + r} A ${r},${r} 0 0,1 ${s},${svgH - s - r} ` +
      `V ${s + r} A ${r},${r} 0 0,1 ${s + r},${s} Z`;
    return { path, svgW, svgH };
  }

  // Odd → L-shape.
  // fullRowsH = top-of-last-row in grid coords
  const fullRowsH = (totalRows - 1) * (cellH + g);

  // Notch positioned exactly `m` outside each occupied cell edge
  // Last full-row bottom in grid coords = fullRowsH - g
  // → in SVG coords = m + (fullRowsH - g); add another m for uniform margin
  const notchY = 2 * m + fullRowsH - g; // in SVG coords

  // col-0 right edge in grid coords = cellW
  // → in SVG coords = m + cellW; add another m for uniform margin
  const notchX = 2 * m + cellW; // in SVG coords

  const path =
    // Top-left → top-right
    `M ${s + r},${s} H ${svgW - s - r} A ${r},${r} 0 0,1 ${svgW - s},${s + r} ` +
    // Right side down to outer notch corner
    `V ${notchY - r} A ${r},${r} 0 0,1 ${svgW - s - r},${notchY} ` +
    // Horizontal step going left to notch centre
    `H ${notchX + r} ` +
    // Concave (inner) notch corner — CCW arc (sweep-flag=0)
    `A ${r},${r} 0 0,0 ${notchX},${notchY + r} ` +
    // Right side of col-0 last row down to bottom
    `V ${svgH - s - r} A ${r},${r} 0 0,1 ${notchX - r},${svgH - s} ` +
    // Bottom edge and bottom-left corner
    `H ${s + r} A ${r},${r} 0 0,1 ${s},${svgH - s - r} ` +
    // Left side back to start
    `V ${s + r} A ${r},${r} 0 0,1 ${s + r},${s} Z`;

  return { path, svgW, svgH };
}

// ─── VariantGroupCard ─────────────────────────────────────────────────────────
type VariantGroupCardProps = {
  groupKey: string;
  groupMain: GalleryItem;
  items: GalleryItem[];
  deletingItemId: string | null;
  onInsert: (item: GalleryItem) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, item: GalleryItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
};

function VariantGroupCard({
  groupKey,
  groupMain,
  items,
  deletingItemId,
  onInsert,
  onDragStart,
  onDelete,
  onClose,
}: VariantGroupCardProps) {
  const gridRef = React.useRef<HTMLDivElement>(null);
  const MARGIN = 8;
  const [borderState, setBorderState] = React.useState<{ path: string; svgW: number; svgH: number; gridW: number } | null>(null);

  const count = items.length;
  const hue = 262;
  const sat = 60 + Math.min(count * 5, 30);
  const strokeW = count <= 2 ? 1.5 : count <= 4 ? 2 : 2.5;
  const borderColor = `hsl(${hue} ${sat}% 55%)`;
  const glowColor = `hsl(${hue} ${sat}% 65% / 0.5)`;
  const glowBlur = count <= 2 ? 3 : count <= 4 ? 6 : 9;

  React.useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const compute = () => {
      const W = el.clientWidth;
      if (W === 0) return;
      const { path, svgW, svgH } = computeVariantBorderPath(W, count, 8, strokeW, 8, MARGIN);
      setBorderState({ path, svgW, svgH, gridW: W });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count, strokeW, MARGIN]);

  return (
    <div
      key={groupKey}
      className="col-span-2 animate-in fade-in slide-in-from-top-1 duration-300"
      style={{ animationFillMode: 'both' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Label acima da borda */}
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: borderColor }}>
          {groupMain.originalName} &middot; {count} {count === 1 ? 'versão' : 'versões'}
        </span>
        <button
          className="rounded p-0.5 transition-colors hover:bg-black/10"
          style={{ color: borderColor }}
          onClick={onClose}
          title="Fechar versões"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Grid com overlay SVG de contorno dinâmico */}
      <div ref={gridRef} className="relative grid grid-cols-2 gap-2">
        {borderState && (
          <svg
            className="pointer-events-none absolute"
            style={{
              top: -MARGIN,
              left: -MARGIN,
              width: borderState.svgW,
              height: borderState.svgH,
              overflow: 'visible',
              filter: `drop-shadow(0 0 ${glowBlur}px ${glowColor})`,
              zIndex: 10,
            }}
          >
            <path
              d={borderState.path}
              fill="none"
              stroke={borderColor}
              strokeWidth={strokeW}
              strokeLinejoin="round"
            />
          </svg>
        )}

        {items.map((item, idx) => (
          <div
            key={item.id}
            className="group/v relative aspect-square overflow-hidden rounded-lg bg-white cursor-pointer hover:shadow-md transition-shadow animate-in fade-in zoom-in-95 duration-200"
            style={{ animationDelay: `${idx * 60}ms`, animationFillMode: 'both' }}
            draggable
            onClick={() => { onInsert(item); onClose(); }}
            onDragStart={(e) => onDragStart(e, item)}
          >
            <img
              src={item.previewUrl}
              alt={item.originalName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div
              className="absolute left-1 bottom-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ background: `${borderColor}cc` }}
            >
              {idx === 0 ? 'original' : `v${idx}`}
            </div>
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/v:opacity-100 transition-opacity duration-200 flex items-center justify-center">
              <Button
                size="icon"
                variant="destructive"
                className="h-6 w-6 rounded-full shadow"
                onClick={(e) => onDelete(item.id, e)}
                disabled={deletingItemId === item.id}
                title="Excluir versão"
              >
                {deletingItemId === item.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [isPublicUpload, setIsPublicUpload] = useState(false);

  const upsertGalleryVisibility = async (storagePath: string, visible: boolean) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from("gallery_visibility").upsert(
      {
        user_id: user.id,
        storage_path: storagePath,
        is_public: visible,
      },
      { onConflict: "user_id,storage_path" }
    );
    if (error) throw error;
  };

  const deleteImage = async (itemId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!supabase || !user) return;

    setDeletingItemId(itemId);
    try {
      // Deleta o arquivo do Storage
      const { error: deleteStorageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([itemId]);

      if (deleteStorageError) throw deleteStorageError;

      // Deleta a entrada de visibilidade do banco de dados
      const { error: deleteDbError } = await supabase
        .from("gallery_visibility")
        .delete()
        .eq("storage_path", itemId)
        .eq("user_id", user.id);

      if (deleteDbError && deleteDbError.code !== "42P01") {
        throw deleteDbError;
      }

      // Remove da galeria local
      setGallery((prev) => prev.filter((item) => item.id !== itemId));
      toast.success("Imagem excluída com sucesso");
    } catch (err: any) {
      console.error("[deleteImage]", err);
      toast.error(err?.message || "Falha ao excluir imagem");
    } finally {
      setDeletingItemId(null);
    }
  };

  // ===== Galeria
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());

  const openFilePicker = () => fileInputRef.current?.click();

  const onFileChosen: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    if (!f) return;
    setSelectedFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
    setIsUploadOpen(true);
  };

  const exportPreviewToDataUrl = async (): Promise<string> =>
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
    const groupId = createGroupId();
    const filename = `${tsPrefix()}-${base}__g-${groupId}__o.png`;
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

    return { path, previewUrl, originalName: `${base}.png`, groupId, isVariant: false };
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

      const { data: visibilityRows, error: visibilityError } = await supabase
        .from("gallery_visibility")
        .select("storage_path,is_public")
        .eq("user_id", user.id);

      if (visibilityError && visibilityError.code !== "42P01") {
        throw visibilityError;
      }

      const visibilityMap = new Map<string, boolean>(
        (visibilityRows || []).map((row: any) => [String(row.storage_path), Boolean(row.is_public)])
      );

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

        const parsed = parseStoredFilename(f.name);
        items.push({
          id: fullPath,
          previewUrl,
          originalName: parsed.cleanName,
          sortKey: parsed.sortKey || f.name.slice(0, 17),
          isPublic: visibilityMap.get(fullPath) ?? false,
          groupId: parsed.groupId || `legacy${toSafeGroupId(f.name).slice(0, 24) || "image"}`,
          isVariant: parsed.isVariant,
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
            groupId?: string;
            isVariant?: boolean;
            isPublic?: boolean;
          }
        | undefined;

      if (!detail?.id || !detail?.previewUrl) return;
      if (detail.userId && detail.userId !== user.id) return;

      const item: GalleryItem = {
        id: detail.id,
        previewUrl: detail.previewUrl,
        originalName: detail.originalName || "imagem.png",
        sortKey: detail.sortKey || "",
        isPublic: Boolean(detail.isPublic),
        groupId: detail.groupId || `event${toSafeGroupId(detail.id).slice(0, 24) || "image"}`,
        isVariant: Boolean(detail.isVariant),
      };

      setGallery((prev) => [item, ...prev.filter((p) => p.id !== item.id)]);
    };

    window.addEventListener("uploadGallery:newItem", handler as EventListener);
    return () => window.removeEventListener("uploadGallery:newItem", handler as EventListener);
  }, [user]);

  const handleConfirm = async () => {
    try {
      setIsSaving(true);
      const dataUrl = await exportPreviewToDataUrl();
      const saved = await uploadToSupabase(dataUrl);
      await upsertGalleryVisibility(saved.path, isPublicUpload);
      setGallery((prev) => [
        {
          id: saved.path,
          previewUrl: saved.previewUrl,
          originalName: saved.originalName,
          sortKey: saved.path.split("/").pop()!.slice(0, 17),
          isPublic: isPublicUpload,
          groupId: saved.groupId,
          isVariant: saved.isVariant,
        },
        ...prev,
      ]);

      setIsUploadOpen(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setSelectedFile(null);
      setIsPublicUpload(false);
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
    setIsPublicUpload(false);
  };

  const envMissing = !supabase;

  const insertGalleryItem = (item: GalleryItem) => {
    onImageInsert?.(item.previewUrl, {
      meta: {
        galleryItemId: item.id,
        galleryGroupId: item.groupId,
        galleryOriginalName: item.originalName,
        galleryIsVariant: item.isVariant,
      },
    });
  };

  const handleGalleryDragStart = (e: React.DragEvent<HTMLDivElement>, item: GalleryItem) => {
    e.dataTransfer.setData("text/plain", item.previewUrl);
    e.dataTransfer.setData(
      "application/x-molda-gallery-meta",
      JSON.stringify({
        galleryItemId: item.id,
        galleryGroupId: item.groupId,
        galleryOriginalName: item.originalName,
        galleryIsVariant: item.isVariant,
      })
    );
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const groupedGallery = useMemo(() => {
    const groups = new Map<string, GalleryItem[]>();
    for (const item of gallery) {
      const key = item.groupId || item.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }

    const entries = Array.from(groups.entries()).map(([groupId, items]) => {
      const ordered = items
        .slice()
        .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));
      const main = ordered.find((x) => !x.isVariant) || ordered[ordered.length - 1];
      const latestSortKey = ordered[0]?.sortKey || "";
      return { groupId, items: ordered, main, latestSortKey };
    });

    entries.sort((a, b) =>
      a.latestSortKey < b.latestSortKey ? 1 : a.latestSortKey > b.latestSortKey ? -1 : 0
    );
    return entries;
  }, [gallery]);

  // Lista plana de células do grid: pastas compactas, variantes expandidas e itens soltos
  const renderEntries = useMemo(() => {
    const anyExpanded = expandedGroupIds.size > 0;
    const result: Array<
      | { key: string; type: 'folder' | 'single'; group: (typeof groupedGallery)[0]; item: GalleryItem; inactive: boolean }
      | { key: string; type: 'variant-group'; group: (typeof groupedGallery)[0]; items: GalleryItem[]; inactive: boolean }
    > = [];

    for (const group of groupedGallery) {
      const isGrouped = group.items.length > 1;
      const isExpanded = expandedGroupIds.has(group.groupId);

      if (isGrouped && isExpanded) {
        const original = group.items.find((x) => !x.isVariant) || group.main;
        const variants = group.items.filter((x) => x.id !== original.id);
        result.push({ key: `vg-${group.groupId}`, type: 'variant-group', group, items: [original, ...variants], inactive: false });
      } else if (isGrouped) {
        result.push({ key: group.groupId, type: 'folder', group, item: group.main, inactive: anyExpanded });
      } else {
        result.push({ key: group.main.id, type: 'single', group, item: group.main, inactive: anyExpanded });
      }
    }
    return result;
  }, [groupedGallery, expandedGroupIds]);

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
      <div
        className="grid grid-cols-2 gap-2"
        onClick={() => { if (expandedGroupIds.size > 0) setExpandedGroupIds(new Set()); }}
      >
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
          renderEntries.map((entry) => {
            // ── Pasta compacta (grupo fechado) ──────────────────────────────
            if (entry.type === 'folder') {
              // Back card: primeiro item do grupo que seja diferente do main
              const backItem = entry.group.items.find((x) => x.id !== entry.item.id);
              return (
                <div
                  key={entry.key}
                  className={`relative cursor-pointer transition-opacity duration-300 ${
                    entry.inactive ? 'opacity-40 pointer-events-none' : ''
                  }`}
                  onClick={() => toggleGroup(entry.group.groupId)}
                  title={`${entry.group.items.length} versões — clique para expandir`}
                >
                  <div className="relative">
                    {/* Card traseiro com a segunda versão */}
                    {backItem && (
                      <div
                        className="absolute inset-0 overflow-hidden rounded-md border border-gray-200"
                        style={{
                          transform: 'translate(7px, -6px) rotate(5deg)',
                          zIndex: 1,
                          opacity: 0.85,
                        }}
                      >
                        <img
                          src={backItem.previewUrl}
                          alt={backItem.originalName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                    {/* Card principal (frente) — define a altura do container */}
                    <div
                      className="relative aspect-square overflow-hidden rounded-md border bg-white hover:shadow-md transition-shadow"
                      style={{ zIndex: 2 }}
                    >
                      <img
                        src={entry.item.previewUrl}
                        alt={entry.item.originalName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {entry.group.items.length} versões
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // ── Grupo expandido — contorno dinâmico envolvendo todas as versões ──
            if (entry.type === 'variant-group') {
              return (
                <VariantGroupCard
                  key={entry.key}
                  groupKey={entry.key}
                  groupMain={entry.group.main}
                  items={entry.items}
                  deletingItemId={deletingItemId}
                  onInsert={insertGalleryItem}
                  onDragStart={handleGalleryDragStart}
                  onDelete={deleteImage}
                  onClose={() => toggleGroup(entry.group.groupId)}
                />
              );
            }

            // ── Item simples (sem grupo) ────────────────────────────────────
            return (
              <div
                key={entry.key}
                className={`group relative aspect-square overflow-hidden rounded-md border bg-white cursor-pointer hover:shadow-md transition-all duration-300 ${
                  entry.inactive ? 'opacity-40 pointer-events-none' : ''
                }`}
                draggable={!entry.inactive}
                onClick={() => insertGalleryItem(entry.item)}
                onDragStart={(e) => handleGalleryDragStart(e, entry.item)}
              >
                <img
                  src={entry.item.previewUrl}
                  alt={entry.item.originalName}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                  <Button
                    size="icon"
                    variant="destructive"
                    className="rounded-full shadow-lg"
                    onClick={(e) => deleteImage(entry.item.id, e)}
                    disabled={deletingItemId === entry.item.id}
                    title="Excluir imagem"
                  >
                    {deletingItemId === entry.item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Dialog de edição/preview */}
      <Dialog open={isUploadOpen} onOpenChange={(v) => (v ? setIsUploadOpen(v) : handleCloseDialog())}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Pré-visualizar</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4">
            <div className="w-full max-h-[60vh] overflow-auto rounded-lg border bg-black/5 p-2 flex items-center justify-center">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Prévia"
                  className="max-h-[56vh] w-auto object-contain"
                />
              ) : (
                <div className="text-gray-500 text-sm">Selecione uma imagem…</div>
              )}
            </div>

            {/* Ferramentas horizontais */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">Visibilidade</span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIsPublicUpload((prev) => !prev)}
                  title={isPublicUpload ? "Público" : "Não público"}
                  aria-label={isPublicUpload ? "Definir como não público" : "Definir como público"}
                >
                  <span className={`relative inline-flex transition-transform duration-500 ${isPublicUpload ? "rotate-180" : "rotate-0"}`}>
                    <Earth className="h-4 w-4" />
                    {!isPublicUpload && (
                      <span className="pointer-events-none absolute left-1/2 top-1/2 h-5 w-[2px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-current" />
                    )}
                  </span>
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
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
