// src/components/DesignFinder.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase, STORAGE_BUCKET } from "../lib/supabaseClient";
import { Clock, ImageOff, Loader2, Search, TrendingUp } from "lucide-react";

type DesignItem = {
  storage_path: string;
  design_name: string | null;
  design_value: number;
  user_id: string;
  updated_at: string;
  previewUrl?: string;
};

type SortMode = "recent" | "popular";

type Props = {
  onImageInsert?: (
    src: string,
    opts?: { x?: number; y?: number; scale?: number; meta?: Record<string, unknown> }
  ) => void;
};

export default function DesignFinder({ onImageInsert }: Props) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [items, setItems] = useState<DesignItem[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchDesigns = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    try {
      let q = supabase
        .from("gallery_visibility")
        .select("storage_path, design_name, design_value, user_id, updated_at")
        .eq("is_public", true)
        .limit(48);

      if (query.trim()) {
        q = q.ilike("design_name", `%${query.trim()}%`);
      }

      q =
        sortMode === "popular"
          ? q.order("design_value", { ascending: false })
          : q.order("updated_at", { ascending: false });

      const { data, error } = await q;

      if (error || !data || data.length === 0) {
        setItems([]);
        return;
      }

      // Batch signed URLs
      const paths = (data as any[]).map((d) => d.storage_path).filter(Boolean);
      const signedMap: Record<string, string> = {};

      if (paths.length > 0) {
        const { data: signedData } = await supabase.storage
          .from(STORAGE_BUCKET)
          .createSignedUrls(paths, 3600);

        if (signedData) {
          for (const entry of signedData as any[]) {
            if (entry.signedUrl && entry.path) {
              signedMap[String(entry.path)] = entry.signedUrl;
            }
          }
        }
      }

      setItems(
        (data as any[]).map((d) => ({
          ...d,
          previewUrl:
            signedMap[d.storage_path] ||
            supabase.storage.from(STORAGE_BUCKET).getPublicUrl(d.storage_path).data
              .publicUrl,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [query, sortMode]);

  useEffect(() => {
    const timer = setTimeout(fetchDesigns, 350);
    return () => clearTimeout(timer);
  }, [fetchDesigns]);

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-black/40 dark:text-white/40" />
        <input
          type="text"
          placeholder="Buscar designs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/5 py-2 pl-9 pr-3 text-sm placeholder:text-black/40 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
        />
      </div>

      {/* Sort pills */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setSortMode("recent")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
            sortMode === "recent"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/15"
          }`}
        >
          <Clock className="h-3 w-3" />
          Em alta
        </button>
        <button
          type="button"
          onClick={() => setSortMode("popular")}
          className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
            sortMode === "popular"
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60 hover:bg-black/10 dark:hover:bg-white/15"
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          Mais populares
        </button>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-black/30 dark:text-white/30" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-sm text-black/40 dark:text-white/40">
          <ImageOff className="h-8 w-8" />
          <span>Nenhum design encontrado</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <button
              key={item.storage_path}
              type="button"
              title={item.design_name || "Design"}
              onClick={() => item.previewUrl && onImageInsert?.(item.previewUrl)}
              className="aspect-square overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 transition hover:border-black/25 dark:hover:border-white/25 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/30"
            >
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt={item.design_name || "Design"}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageOff className="h-5 w-5 text-black/20 dark:text-white/20" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
