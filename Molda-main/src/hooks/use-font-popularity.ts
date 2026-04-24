import { useEffect, useMemo, useState } from "react";
import {
  fetchFontPopularityScores,
  FONT_POPULARITY_UPDATED_EVENT,
} from "../api/fontPopularity";

export function useFontPopularity(families?: string[]) {
  const stableFamilies = useMemo(() => {
    if (!families?.length) return [];
    return Array.from(new Set(families.map((family) => family.trim()).filter(Boolean))).sort();
  }, [families]);

  const [scores, setScores] = useState<Record<string, number>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const nextScores = await fetchFontPopularityScores(stableFamilies);
        if (!alive) return;
        setScores(nextScores);
      } catch (error) {
        console.warn("[useFontPopularity] failed to load scores:", error);
      }
    })();

    return () => {
      alive = false;
    };
  }, [stableFamilies]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent)?.detail || {};
      const family = typeof detail.family === "string" ? detail.family.trim() : "";
      if (!family) return;
      if (stableFamilies.length && !stableFamilies.includes(family)) return;

      setScores((prev) => ({
        ...prev,
        [family]: (prev[family] || 0) + 1,
      }));
    };

    window.addEventListener(FONT_POPULARITY_UPDATED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(FONT_POPULARITY_UPDATED_EVENT, handler as EventListener);
    };
  }, [stableFamilies]);

  return { scores };
}