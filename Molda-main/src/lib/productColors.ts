export const DEFAULT_PRODUCT_COLOR_OPTIONS = [
  "#ffffff",
  "#111827",
  "#6b7280",
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
] as const;

export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{6})$/;

export function normalizeHexColor(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR_REGEX.test(normalized) ? normalized : null;
}

export function parseColorList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const items = value
    .split(/[\n,;]+/)
    .map((item) => normalizeHexColor(item))
    .filter((item): item is string => !!item);

  items.forEach((item) => seen.add(item));
  return Array.from(seen);
}
