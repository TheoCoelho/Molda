import { getSupabase } from "../lib/supabaseClient";

export const FONT_POPULARITY_UPDATED_EVENT = "font-popularity:updated";

const LOCAL_STORAGE_KEY = "molda_font_popularity_daily";
const POPULARITY_WINDOW_DAYS = 30;

type DailyPopularityBuckets = Record<string, number>;
type LocalPopularityStore = Record<string, DailyPopularityBuckets>;

function startOfUtcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function toIsoDay(date = new Date()) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function getCutoffIsoDay(now = new Date()) {
  const cutoff = startOfUtcDay(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - (POPULARITY_WINDOW_DAYS - 1));
  return toIsoDay(cutoff);
}

function isInsideRollingWindow(isoDay: string, now = new Date()) {
  return isoDay >= getCutoffIsoDay(now) && isoDay <= toIsoDay(now);
}

function readLocalStore(): LocalPopularityStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as LocalPopularityStore;
  } catch {
    return {};
  }
}

function writeLocalStore(store: LocalPopularityStore) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function pruneBuckets(store: LocalPopularityStore, now = new Date()) {
  const next: LocalPopularityStore = {};

  for (const [family, buckets] of Object.entries(store)) {
    if (!buckets || typeof buckets !== "object") continue;
    const keptEntries = Object.entries(buckets).filter(([isoDay, count]) => {
      return Number.isFinite(count) && count > 0 && isInsideRollingWindow(isoDay, now);
    });

    if (!keptEntries.length) continue;
    next[family] = Object.fromEntries(keptEntries);
  }

  return next;
}

function computeScoresFromLocalStore(store: LocalPopularityStore, families?: string[]) {
  const sourceFamilies = families?.length ? families : Object.keys(store);
  const scores: Record<string, number> = {};

  for (const family of sourceFamilies) {
    const buckets = store[family];
    if (!buckets) continue;
    scores[family] = Object.values(buckets).reduce((total, value) => total + value, 0);
  }

  return scores;
}

function dispatchPopularityUpdated(family: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(FONT_POPULARITY_UPDATED_EVENT, {
        detail: { family, at: new Date().toISOString() },
      })
    );
  } catch {}
}

function incrementLocalPopularity(family: string) {
  const now = new Date();
  const store = pruneBuckets(readLocalStore(), now);
  const isoDay = toIsoDay(now);
  const familyBuckets = { ...(store[family] || {}) };
  familyBuckets[isoDay] = (familyBuckets[isoDay] || 0) + 1;
  store[family] = familyBuckets;
  writeLocalStore(store);
}

export async function incrementFontPopularity(family: string): Promise<void> {
  const normalizedFamily = typeof family === "string" ? family.trim() : "";
  if (!normalizedFamily) return;

  const sb = getSupabase();
  if (!sb) {
    incrementLocalPopularity(normalizedFamily);
    dispatchPopularityUpdated(normalizedFamily);
    return;
  }

  const { error } = await sb.rpc("increment_font_popularity", {
    p_family: normalizedFamily,
  });

  if (error) {
    console.warn("[fontPopularity] increment rpc failed, using local fallback:", error);
    incrementLocalPopularity(normalizedFamily);
  }

  dispatchPopularityUpdated(normalizedFamily);
}

export async function fetchFontPopularityScores(families?: string[]): Promise<Record<string, number>> {
  const normalizedFamilies = families
    ?.map((family) => (typeof family === "string" ? family.trim() : ""))
    .filter(Boolean);

  const sb = getSupabase();
  if (!sb) {
    const localStore = pruneBuckets(readLocalStore());
    writeLocalStore(localStore);
    return computeScoresFromLocalStore(localStore, normalizedFamilies);
  }

  const { data, error } = await sb.rpc("get_font_popularity_scores", {
    p_families: normalizedFamilies?.length ? normalizedFamilies : null,
  });

  if (error) {
    console.warn("[fontPopularity] score rpc failed, using local fallback:", error);
    const localStore = pruneBuckets(readLocalStore());
    writeLocalStore(localStore);
    return computeScoresFromLocalStore(localStore, normalizedFamilies);
  }

  const scores: Record<string, number> = {};
  for (const row of (data || []) as Array<{ family?: string; score_30d?: number | string }>) {
    const family = typeof row.family === "string" ? row.family.trim() : "";
    if (!family) continue;
    const score = typeof row.score_30d === "number" ? row.score_30d : Number(row.score_30d || 0);
    scores[family] = Number.isFinite(score) ? score : 0;
  }

  return scores;
}