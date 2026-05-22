import React, { useCallback, useEffect, useState } from "react";
import { Clock, ImageOff, Loader2, Search } from "lucide-react";
import { apiRequest } from "@/api/backend";

type DesignItem = {
  id: string;
  title: string;
  image_url: string;
  created_at: string;
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

  const fetchDesigns = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{ items: DesignItem[] }>("/gallery/public?limit=80");
      let next = response.items ?? [];

      if (query.trim()) {
        const q = query.trim().toLowerCase();
        next = next.filter((item) => (item.title || "").toLowerCase().includes(q));
      }

      if (sortMode === "popular") {
        next = next.slice().sort((a, b) => (b.title || "").localeCompare(a.title || ""));
      } else {
        next = next.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      setItems(next.slice(0, 48));
    } catch {
      setItems([]);
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
          Recentes
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
          Mais vistos
        </button>
      </div>

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
              key={item.id}
              type="button"
              title={item.title || "Design"}
              onClick={() => item.image_url && onImageInsert?.(item.image_url)}
              className="aspect-square overflow-hidden rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 transition hover:border-black/25 dark:hover:border-white/25 hover:scale-[1.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-black/30 dark:focus-visible:ring-white/30"
            >
              <img src={item.image_url} alt={item.title || "Design"} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
