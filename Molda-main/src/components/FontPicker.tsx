// src/components/FontPicker.tsx
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  memo,
} from "react";
import { FONT_LIBRARY, DEFAULT_PREVIEW_TEXT, type FontItem } from "../fonts/library";
import { ensureFontForFabric, wantVariantsFor } from "../utils/fonts";
import { toast } from "../hooks/use-toast";
import { useRecentFonts } from "../hooks/use-recent-fonts";
import {
  fetchUserFavorites,
  addFavoriteFont,
  removeFavoriteFont,
} from "../api/fontFavorites";

// Cache simples para evitar recarregar a mesma família várias vezes
const fontLoadCache = new Map<string, Promise<void>>();
const PRELOAD_LOOKAHEAD = 24;
const PRELOAD_CONCURRENCY = 4;
const SCROLL_DAMPING = 0.28;
const MAX_SCROLL_STEP = 72;

function toNumberArray(input?: Array<number | string>): number[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: number[] = [];
  for (const v of input) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out.length ? out : undefined;
}

/** Limita o texto do preview para subsetting (&text=) e reduz custo de download/render */
function previewSubsetText(s: string, max = 48) {
  const unique = Array.from(new Set((s || "").slice(0, max).split("")));
  // evita espaços em excesso no parâmetro text=
  return unique.join("").replace(/\s{2,}/g, " ");
}

/** Carrega uma família apenas uma vez (não cacheia falhas) */
function loadFamilyOnce(item: FontItem, previewText: string) {
  if (!item?.family) return Promise.resolve();
  const key = item.family;
  if (!fontLoadCache.has(key)) {
    const variants = wantVariantsFor(item.family);
    const text = previewSubsetText(item.previewText || previewText || DEFAULT_PREVIEW_TEXT);
    fontLoadCache.set(
      key,
      ensureFontForFabric(item.family, "google", { ...variants, text }).catch((e) => {
        fontLoadCache.delete(key);
        throw e;
      })
    );
  }
  return fontLoadCache.get(key)!;
}

type Props = {
  /** Lista de fontes. Se não vier, usa FONT_LIBRARY */
  fonts?: FontItem[];
  /** controlado externamente (ex.: Sidebar definindo via evento) — opcional */
  value?: string;
  /** callback quando usuário selecionar uma fonte */
  onSelect?: (family: string) => void;
  /** placeholder do filtro */
  placeholder?: string;
  /** mostra campo de busca (default: true) */
  searchable?: boolean;
  /** altura máxima do painel (tailwind classes) — NÃO alterada */
  maxHeightClass?: string;
};

function normalizeName(family?: string) {
  // Menos agressivo: não remove hífens/parênteses para não distorcer nomes
  return (family || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ícones SVG simples (sem libs) */
function StarIcon({ filled }: { filled: boolean }) {
  return filled ? (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

/** Item (memoizado) — com content-visibility + carregamento automático ao entrar em viewport */
const FontRow = memo(function FontRow({
  item,
  isActive,
  starred,
  onToggleStar,
  onClick,
  onPrefetch,
  previewFallback,
}: {
  item: FontItem;
  isActive: boolean;
  starred: boolean;
  onToggleStar: (family: string, next: boolean) => void;
  onClick: () => void;
  onPrefetch: (item: FontItem) => void;
  previewFallback: string;
}) {
  const familyStyle = { fontFamily: `"${item.family}", ui-sans-serif, system-ui, sans-serif` };

  // category ou categories
  const category =
    (item as any).category ||
    ((item as any).categories?.length ? (item as any).categories[0] : undefined);

  const display = (item as any).label || item.family;

  const handleStarClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleStar(item.family, !starred);
  };

  return (
    <li
      key={item.family}
      style={{
        contentVisibility: "auto" as any,
        containIntrinsicSize: "72px 320px",
      }}
    >
      <div
        className={[
          "w-full text-left px-3 py-3 text-sm transition-colors",
          isActive ? "bg-purple-50/60" : "hover:bg-white/5",
          "rounded-lg",
        ].join(" ")}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            data-font-item="1"
            data-active={isActive ? "true" : "false"}
            role="option"
            aria-selected={isActive}
            className="flex-1 min-w-0 text-left px-2 py-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            onClick={onClick}
            onMouseEnter={() => onPrefetch(item)}
            onFocus={() => onPrefetch(item)}
            title={display}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="truncate font-medium text-base" style={familyStyle}>
                {display}
                {category && <span className="ml-2 text-xs text-gray-500 font-normal">({category})</span>}
              </span>
            </div>

            <div className="mt-2 text-base text-gray-600 truncate leading-relaxed" style={familyStyle}>
              {item.previewText || previewFallback}
            </div>

          </button>

          {/* ⭐ Botão estrela — agora controlado pelo pai (favoritos reais) */}
          <button
            type="button"
            aria-label={starred ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            title={starred ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            onClick={handleStarClick}
            className={[
              "shrink-0 inline-flex items-center justify-center",
              "h-9 w-9 rounded-lg border border-transparent",
              "hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300",
              starred ? "text-yellow-500" : "text-gray-500",
            ].join(" ")}
          >
            <StarIcon filled={starred} />
          </button>
        </div>
      </div>
    </li>
  );
});

/**
 * FontPicker:
 * - Virtualização simples (renderiza só o que está visível + overscan)
 * - content-visibility nos itens (pula layout/pintura fora da viewport)
 * - subsetting de glifos no carregamento (&text=)
 * - carregamento automático por IntersectionObserver (sem depender de hover)
 * - Favoritos persistentes por usuário (Flask)
 */
export default function FontPicker({
  fonts,
  value,
  onSelect,
  placeholder = "Buscar fonte…",
  searchable = true,
  maxHeightClass = "max-h-72", // NÃO alterada
}: Props) {
  const [internalSelected, setInternalSelected] = useState<string>("");
  const [query, setQuery] = useState("");
  const [filterTag, setFilterTag] = useState<"favoritos" | "recentes" | "">(""); // agora "favoritos" e "recentes" funcionam
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [resolvedFamilies, setResolvedFamilies] = useState<Set<string>>(new Set());
  const [loadingFamilies, setLoadingFamilies] = useState<Set<string>>(new Set());

  // ===== NEW: favoritos do usuário =====
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // ===== NEW: fontes recentes =====
  const { addRecentFont, getRecentFontFamilies, clearRecentFonts } = useRecentFonts();

  // carrega favoritos ao montar
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchUserFavorites(); // string[]
        if (!alive) return;
        setFavorites(new Set(list.map((s) => s.trim())));
      } catch (err) {
        // silencioso; se quiser, exiba um toast light:
        // toast({ title: "Não foi possível carregar favoritos", variant: "default" });
        console.warn("fetchUserFavorites failed", err);
      }
    })();
    return () => { alive = false; };
  }, []);

  const data = fonts && fonts.length ? fonts : FONT_LIBRARY;

  const activeFamily = useMemo(
    () => (value != null ? value : internalSelected),
    [value, internalSelected]
  );

  // Aplica filtro textual primeiro
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((f) => {
      const parts = [
        f.family,
        (f as any).label || "",
        (f as any).category || "",
        ((f as any).categories || []).join(" "),
        Array.isArray(f.styles) ? f.styles.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();
      return parts.includes(q);
    });
  }, [data, query]);

  // Aplica filtro "favoritos" ou "recentes" (quando selecionado)
  const filtered = useMemo(() => {
    if (filterTag === "favoritos") {
      if (!favorites.size) return [];
      return baseFiltered.filter((f) => favorites.has(f.family));
    }
    
    if (filterTag === "recentes") {
      const recentFamilies = getRecentFontFamilies();
      if (!recentFamilies.length) return [];
      
      // Filtra apenas as fontes que estão na lista de recentes
      const recentFonts = baseFiltered.filter((f) => recentFamilies.includes(f.family));
      
      // Ordena pelas mais recentes primeiro (mantém a ordem do getRecentFontFamilies)
      return recentFonts.sort((a, b) => {
        const indexA = recentFamilies.indexOf(a.family);
        const indexB = recentFamilies.indexOf(b.family);
        return indexA - indexB;
      });
    }
    
    return baseFiltered;
  }, [baseFiltered, filterTag, favorites, getRecentFontFamilies]);

  // sincroniza com Editor2D via eventos
  useEffect(() => {
    const handler = (ev: Event) => {
      try {
        // @ts-ignore
        const detail = ev?.detail || {};
        const fam = String(detail?.fontFamily || "").trim();
        if (fam && value == null) {
          setInternalSelected(fam);
        }
      } catch {}
    };

    window.addEventListener("editor2d:activeTextStyle", handler as any);
    window.addEventListener("editor2d:selectionStyle", handler as any);
    window.addEventListener("editor2d:selectionChange", handler as any);

    try {
      window.dispatchEvent(new CustomEvent("editor2d:requestActiveTextStyle"));
    } catch {}

    return () => {
      window.removeEventListener("editor2d:activeTextStyle", handler as any);
      window.removeEventListener("editor2d:selectionStyle", handler as any);
      window.removeEventListener("editor2d:selectionChange", handler as any);
    };
  }, [value]);

  // ======================= VIRTUALIZAÇÃO =======================
  const ITEM_HEIGHT = 84; // px (aprox.) — aumentado de 56 para 84 para acomodar o novo layout expandido
  const OVERSCAN = 6;

  const [viewportH, setViewportH] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  // Atualiza medidas ao montar/redimensionar
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const total = filtered.length;

  const startIndex = Math.max(
    0,
    Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN
  );
  const endIndex = Math.min(
    total - 1,
    Math.floor((scrollTop + viewportH) / ITEM_HEIGHT) + OVERSCAN
  );
  const renderSlice = filtered.slice(startIndex, endIndex + 1);
  const paddingTop = startIndex * ITEM_HEIGHT;
  const paddingBottom = (total - (endIndex + 1)) * ITEM_HEIGHT;

  const onScroll: React.UIEventHandler<HTMLDivElement> = (e) => {
    setScrollTop((e.target as HTMLDivElement).scrollTop);
  };

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    const el = scrollRef.current;
    if (!el) return;

    // Diminui a velocidade percebida de rolagem para evitar saltos grandes na biblioteca.
    e.preventDefault();
    const raw = e.deltaY * SCROLL_DAMPING;
    const clamped = Math.max(-MAX_SCROLL_STEP, Math.min(MAX_SCROLL_STEP, raw));
    el.scrollTop += clamped;
    setScrollTop(el.scrollTop);
  };

  // Pré-carregamento concorrente controlado na janela visível + lookahead.
  useEffect(() => {
    if (total === 0) return;
    let cancelled = false;

    const from = Math.max(0, startIndex);
    const to = Math.min(total - 1, endIndex + PRELOAD_LOOKAHEAD);
    const queue = filtered.slice(from, to + 1).filter(
      (font) => !resolvedFamilies.has(font.family) && !loadingFamilies.has(font.family)
    );

    if (!queue.length) return;

    setLoadingFamilies((prev) => {
      const copy = new Set(prev);
      for (const font of queue) copy.add(font.family);
      return copy;
    });

    const run = async () => {
      const workers = Array.from({ length: Math.min(PRELOAD_CONCURRENCY, queue.length) }, async (_, workerIdx) => {
        for (let i = workerIdx; i < queue.length; i += PRELOAD_CONCURRENCY) {
          if (cancelled) return;
          const font = queue[i];
          try {
            await loadFamilyOnce(font, DEFAULT_PREVIEW_TEXT);
            if (!cancelled) {
              setResolvedFamilies((prev) => {
                if (prev.has(font.family)) return prev;
                const copy = new Set(prev);
                copy.add(font.family);
                return copy;
              });
            }
          } catch (err) {
            console.warn("Falha ao carregar preview da fonte", font.family, err);
          } finally {
            if (!cancelled) {
              setLoadingFamilies((prev) => {
                if (!prev.has(font.family)) return prev;
                const copy = new Set(prev);
                copy.delete(font.family);
                return copy;
              });
            }
          }
        }
      });

      await Promise.all(workers);
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [filtered, startIndex, endIndex, total, resolvedFamilies, loadingFamilies]);

  const prefetchFamily = useCallback((item: FontItem) => {
    if (resolvedFamilies.has(item.family) || loadingFamilies.has(item.family)) return;
    setLoadingFamilies((prev) => {
      if (prev.has(item.family)) return prev;
      const copy = new Set(prev);
      copy.add(item.family);
      return copy;
    });

    loadFamilyOnce(item, DEFAULT_PREVIEW_TEXT)
      .then(() => {
        setResolvedFamilies((prev) => {
          if (prev.has(item.family)) return prev;
          const copy = new Set(prev);
          copy.add(item.family);
          return copy;
        });
      })
      .catch((err) => {
        console.warn("Falha ao prefetch da fonte", item.family, err);
      })
      .finally(() => {
        setLoadingFamilies((prev) => {
          if (!prev.has(item.family)) return prev;
          const copy = new Set(prev);
          copy.delete(item.family);
          return copy;
        });
      });
  }, [resolvedFamilies, loadingFamilies]);

  // =============================================================

  // Toggle favorito com UI otimista
  const toggleFavorite = useCallback(async (family: string, next: boolean) => {
    // otimista
    setFavorites((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(family);
      else copy.delete(family);
      return copy;
    });

    try {
      if (next) await addFavoriteFont(family);
      else await removeFavoriteFont(family);
    } catch (err) {
      // rollback
      setFavorites((prev) => {
        const copy = new Set(prev);
        if (next) copy.delete(family);
        else copy.add(family);
        return copy;
      });
      toast({
        title: "Erro ao atualizar favoritos",
        description: "Tente novamente em instantes.",
        variant: "destructive",
      });
      console.error("favorite toggle failed", err);
    }
  }, []);

  // navegação por teclado (apenas sobre o slice atual)
  const onKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    const container = scrollRef.current;
    if (!container) return;
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button[data-font-item='1']")
    );
    if (buttons.length === 0) return;

    const idx = buttons.findIndex((b) => b.getAttribute("data-active") === "true");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = buttons[(idx + 1 + buttons.length) % buttons.length];
      next?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = buttons[(idx - 1 + buttons.length) % buttons.length];
      prev?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const current = document.activeElement as HTMLButtonElement | null;
      current?.click();
    }
  };

  return (
    <>
      {/* Estilos locais: scrollbar fina/flutuante */}
      <style>{`
        .scroll-thin { scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.35) transparent; }
        .scroll-thin::-webkit-scrollbar { width: 6px; height: 6px; }
        .scroll-thin::-webkit-scrollbar-track { background: transparent; }
        .scroll-thin::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.35); border-radius: 9999px; }
        .scroll-thin::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.45); }
      `}</style>

      <div className="w-full">
        {searchable && (
          <div className="mb-2 px-1">
            <div className="flex items-center gap-2 relative justify-center">
              {/* 🔎 Busca */}
              <input
                type="text"
                className="h-9 w-36 px-2 text-sm rounded-md border border-gray-300 bg-transparent focus:outline-none focus:ring-2 focus:ring-purple-300"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar fonte"
              />

              {/* Botão de filtro (UI apenas) */}
              <button
                type="button"
                className="h-9 w-9 flex items-center justify-center rounded-md border border-gray-300 bg-white/50 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-purple-300 hover:bg-gray-100"
                aria-label="Filtrar por"
                title="Filtrar por"
                onClick={() => setShowFilterMenu((v) => !v)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
                  filter_list
                </span>
              </button>
              {/* (ideal mover para index.html) */}
              <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=filter_list" />

              {/* Menu suspenso de opções de filtro */}
              {showFilterMenu && (
                <div className="absolute right-0 top-12 z-30 min-w-[140px] bg-white border border-gray-200 rounded shadow-lg text-sm">
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${filterTag === "" ? "font-semibold text-purple-600" : ""}`}
                    onClick={() => { setFilterTag(""); setShowFilterMenu(false); }}
                  >Nenhum filtro</button>
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${filterTag === "favoritos" ? "font-semibold text-purple-600" : ""}`}
                    onClick={() => { setFilterTag("favoritos"); setShowFilterMenu(false); }}
                  >Favoritos</button>
                  <button
                    className={`w-full text-left px-4 py-2 hover:bg-gray-100 ${filterTag === "recentes" ? "font-semibold text-purple-600" : ""}`}
                    onClick={() => { setFilterTag("recentes"); setShowFilterMenu(false); }}
                  >Recentes</button>
                  
                  {/* Opção para limpar recentes - só aparece se houver fontes recentes */}
                  {getRecentFontFamilies().length > 0 && (
                    <>
                      <hr className="border-gray-200 my-1" />
                      <button
                        className="w-full text-left px-4 py-2 hover:bg-gray-100 text-red-600 hover:bg-red-50"
                        onClick={() => { 
                          if (confirm('Tem certeza que deseja limpar todas as fontes recentes deste projeto?')) {
                            clearRecentFonts();
                            if (filterTag === "recentes") setFilterTag("");
                          }
                          setShowFilterMenu(false); 
                        }}
                      >Limpar recentes</button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          className={["rounded-lg border border-gray-200 overflow-auto", "scroll-thin", maxHeightClass].join(" ")}
          role="listbox"
          aria-label="Biblioteca de fontes"
          tabIndex={0}
          style={{
            // Evita repaints caros no container
            contain: "content",
          }}
        >
          {filtered.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-500">
              {filterTag === "favoritos" 
                ? "Você ainda não marcou nenhuma fonte como favorita." 
                : filterTag === "recentes"
                ? "Você ainda não utilizou nenhuma fonte neste projeto."
                : "Nenhuma fonte encontrada."}
            </div>
          )}

          {/* Virtual list: usa padding para manter o scroll e só renderiza o slice */}
          <div style={{ paddingTop, paddingBottom }}>
            <ul className="divide-y divide-gray-100 px-2 py-1">
              {renderSlice.map((f, i) => {
                const actualIndex = startIndex + i;
                const isActive =
                  normalizeName(value != null ? value : internalSelected) === normalizeName(f.family);
                const isStarred = favorites.has(f.family);
                return (
                  <FontRow
                    key={f.family + "-" + actualIndex}
                    item={f}
                    isActive={isActive}
                    starred={isStarred}
                    onToggleStar={toggleFavorite}
                    onPrefetch={prefetchFamily}
                    onClick={async () => {
                      // Atualiza seleção imediatamente (não bloqueia a UI)
                      if (value == null) setInternalSelected(f.family);
                      onSelect?.(f.family);

                      // Adiciona à lista de fontes recentes
                      addRecentFont(f.family);

                      // Dispara carregamento em background (com subsetting)
                      const variants =
                        f.source === "local"
                          ? { weights: toNumberArray(f.weights as any) ?? [400, 700], styles: (f.styles?.length ? f.styles : ["normal"]) as any }
                          : wantVariantsFor(f.family);

                      const text = previewSubsetText(f.previewText || DEFAULT_PREVIEW_TEXT);
                      ensureFontForFabric(f.family, f.source || "google", { ...variants, text }).catch((err) => {
                        // Não bloqueia — apenas informa (opcional)
                        toast({
                          title: "Fonte selecionada. Carregando em segundo plano…",
                          description: `Se a fonte não aparecer imediatamente, aguarde um instante (display: swap).`,
                          variant: "default",
                        });
                        // eslint-disable-next-line no-console
                        console.warn("Falha ao carregar imediatamente a fonte", f.family, err);
                      });
                    }}
                    previewFallback={DEFAULT_PREVIEW_TEXT}
                  />
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
