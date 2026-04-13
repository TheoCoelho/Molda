// src/lib/models.ts
export type Selection = {
  part?: string | null;
  type?: string | null;
  subtype?: string | null;
};

/**
 * Define uma zona de restrição para posicionamento de decals sobre o modelo 3D.
 * As coordenadas são em espaço de mundo (após aplicar scale/rotation/position do modelo).
 */
type ModelSphereDecalZone = {
  kind?: "sphere";
  /** Nome legível da zona (para debug e logs). Ex: "collar", "shoulder-seam-left". */
  name: string;
  /** Centro da esfera de restrição em espaço de mundo [x, y, z]. */
  center: [number, number, number];
  /** Normal da superfície no ponto marcado (opcional). */
  normal?: [number, number, number];
  /** Raio da esfera de influência (em unidades de mundo). */
  radius: number;
  /**
   * Comportamento quando um decal cai nesta zona:
   * - "block": decal não é exibido nesta região.
   * - "constrain": decal é reduzido proporcionalmente para caber (uso com maxDecalSize).
   */
  behavior: "block" | "constrain";
  /**
   * Apenas para behavior="constrain": dimensão máxima permitida (largura e altura)
   * do decal em unidades de mundo. Decals maiores são reduzidos proporcionalmente.
   */
  maxDecalSize?: number;
};

type ModelStrokeDecalZone = {
  kind: "stroke";
  /** Nome legível da zona (para debug e logs). */
  name: string;
  /** Traço pintado em sequência de pontos no espaço de mundo. */
  points: [number, number, number][];
  /** Normais opcionais por ponto do traço. */
  normals?: [number, number, number][];
  /** Largura do traço de pincel em unidades de mundo. */
  width: number;
  behavior: "block" | "constrain";
  maxDecalSize?: number;
};

export type ModelDecalZone = ModelSphereDecalZone | ModelStrokeDecalZone;

export type ModelConfig = {
  src?: string; // Ex.: "/models/tshirt/scene.gltf" ou ".glb"
  camera?: { position?: [number, number, number]; fov?: number };
  controls?: { maxDistance?: number; minDistance?: number; enableZoom?: boolean; enablePan?: boolean };
  scale?: number | [number, number, number];
  rotation?: [number, number, number];
  position?: [number, number, number];
  /** Zonas de restrição de decal para este modelo. */
  decalZones?: ModelDecalZone[];
};

/* ---------- Normalização e sinônimos ---------- */

const slug = (s?: string | null) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toLowerCase()
    .trim();

const PART_ALIASES: Record<string, string[]> = {
  torso: ["torso", "tronco"],
  head: ["head", "cabeca", "cabeça"],
  legs: ["legs", "pernas", "perna"],
};

const TYPE_ALIASES: Record<string, string[]> = {
  shirt: ["shirt", "camiseta", "tshirt", "t-shirt", "tee"],
  hoodie: ["hoodie", "moletom", "casaco"],
  polo: ["polo"],
  pants: ["pants", "calca", "calça"],
  cap: ["cap", "bone", "boné"],
};

const SUBTYPE_ALIASES: Record<string, string[]> = {
  basic: ["basic", "basica", "básica", "simples"],
  "long-sleeve": ["long-sleeve", "manga-longa", "manga longa", "long", "longa"],
  "long-sleeve-feminina": [
    "long-sleeve-feminina",
    "manga longa feminina",
    "manga-longa feminina",
    "feminina manga longa",
    "feminina manga-longa"
  ],
  "low-poly-glb": [
    "low-poly-glb",
    "low poly glb",
    "low poly (glb)",
    "low-poly (glb)"
  ],
  "low-poly-usdz": [
    "low-poly-usdz",
    "low poly usdz",
    "low poly (usdz)",
    "low-poly (usdz)"
  ],
  "tshirt-gltf": [
    "tshirt-gltf",
    "tshirt gltf",
    "tshirt (gltf)",
    "t-shirt gltf",
    "t-shirt (gltf)"
  ],
  "tshirt-3d-free": [
    "tshirt-3d-free",
    "tshirt 3d free",
    "t-shirt 3d free",
    "t-shirt free",
    "tshirt 3d"
  ],
  oversized: [
    "oversized",
    "oversize",
    "over size",
    "large",
    "larga",
    "ampla"
  ],
  premium: ["premium"],
  classic: ["classic", "classica", "clássica"],
  "male-shorts": [
    "male-shorts",
    "masculino + shorts",
    "masculino shorts",
    "masculino com shorts",
    "masculino shorts set"
  ],
};

function toCanonical(input: string | null | undefined, groups: Record<string, string[]>) {
  const s = slug(input);
  for (const [canon, list] of Object.entries(groups)) {
    if (list.includes(s)) return canon;
  }
  return s; // se não achar, usa o slug como veio
}

function canonicalize(sel: Selection): Required<Selection> {
  return {
    part: toCanonical(sel.part, PART_ALIASES),
    type: toCanonical(sel.type, TYPE_ALIASES),
    subtype: toCanonical(sel.subtype, SUBTYPE_ALIASES),
  } as Required<Selection>;
}

const keyFrom = (sel: Selection) => `${sel.part ?? ""}:${sel.type ?? ""}:${sel.subtype ?? ""}`;

export function normalizeDbDecalZones(value: unknown): ModelDecalZone[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((zone) => {
      if (!zone || typeof zone !== "object") return null;
      const z = zone as Record<string, unknown>;
      const behavior = z.behavior === "constrain" ? "constrain" : "block";
      const maxDecalSize = z.maxDecalSize == null ? undefined : Number(z.maxDecalSize);

      if (z.kind === "stroke") {
        const pointsRaw = Array.isArray(z.points) ? z.points : [];
        const points = pointsRaw
          .map((p) => (Array.isArray(p) && p.length === 3 ? [Number(p[0]), Number(p[1]), Number(p[2])] : null))
          .filter((p): p is [number, number, number] => !!p && p.every((n) => Number.isFinite(n)));
        const normalsRaw = Array.isArray(z.normals) ? z.normals : [];
        const normals = normalsRaw
          .map((p) => (Array.isArray(p) && p.length === 3 ? [Number(p[0]), Number(p[1]), Number(p[2])] : null))
          .filter((p): p is [number, number, number] => !!p && p.every((n) => Number.isFinite(n)));
        const width = Number(z.width);
        if (!points.length || !Number.isFinite(width) || width <= 0) return null;
        return {
          kind: "stroke",
          name: String(z.name || "zone"),
          points,
          normals: normals.length ? normals : undefined,
          width,
          behavior,
          maxDecalSize: Number.isFinite(maxDecalSize) ? maxDecalSize : undefined,
        } satisfies ModelDecalZone;
      }

      const center = Array.isArray(z.center) ? z.center : [];
      if (center.length !== 3) return null;
      const cx = Number(center[0]);
      const cy = Number(center[1]);
      const cz = Number(center[2]);
      const normalRaw = Array.isArray(z.normal) && z.normal.length === 3 ? z.normal : null;
      const nx = normalRaw ? Number(normalRaw[0]) : NaN;
      const ny = normalRaw ? Number(normalRaw[1]) : NaN;
      const nz = normalRaw ? Number(normalRaw[2]) : NaN;
      const radius = Number(z.radius);
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(radius)) {
        return null;
      }
      return {
        name: String(z.name || "zone"),
        center: [cx, cy, cz] as [number, number, number],
        normal: Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz)
          ? [nx, ny, nz] as [number, number, number]
          : undefined,
        radius,
        behavior,
        maxDecalSize: Number.isFinite(maxDecalSize) ? maxDecalSize : undefined,
      } satisfies ModelDecalZone;
    })
    .filter((z): z is ModelDecalZone => !!z);
}

/* ---------- Registry (permanece em inglês / slugs canônicos) ---------- */

const REGISTRY: Record<string, ModelConfig> = {
  // Camiseta básica (low-poly model com suporte a decals)
  "torso:shirt:basic": {
    src: "/models/tshirt-low-poly/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
    decalZones: [
      // Gola: área acima do peito onde o decal atravessa para o pescoço
      { name: "collar", center: [0, 1.25, 0.12], radius: 0.28, behavior: "block" },
      // Costura do ombro esquerdo
      { name: "shoulder-seam-left", center: [-0.55, 1.1, 0.05], radius: 0.18, behavior: "block" },
      // Costura do ombro direito
      { name: "shoulder-seam-right", center: [0.55, 1.1, 0.05], radius: 0.18, behavior: "block" },
    ],
  },

  // Camiseta manga longa
  "torso:shirt:long-sleeve": {
    src: "/models/long_sleeve_t-_shirt/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:long-sleeve-feminina": {
    src: "/models/womens_long_sleeve/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:male-shorts": {
    src: "/models/male_tshirt_and_shorts_-_plain_texture/scene.gltf",
    camera: { position: [0, 1.8, 6], fov: 45 },
    controls: { minDistance: 3, maxDistance: 11, enableZoom: true, enablePan: false },
    scale: 0.75,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:low-poly-glb": {
    src: "/models/t-shirt_low_poly.glb",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:low-poly-usdz": {
    src: "/models/T-Shirt_Low_Poly.usdz",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:tshirt-gltf": {
    src: "/models/tshirt (1)/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:tshirt-3d-free": {
    src: "/models/t-shirt_3d_model_free/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 0.8,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  "torso:shirt:oversized": {
    src: "/models/block_shape_abstract/scene.gltf",
    camera: { position: [0, 1.5, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 1.0,
    rotation: [0, 0, 0],
    position: [0, 0, 0],
  },

  // Slots prontos p/ futuros arquivos:
  "torso:hoodie:basic": {
    src: "/models/hoodie.glb",
    camera: { position: [0, 1.3, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10 },
    scale: 1.05,
  },
  "torso:polo:basic": {
    src: "/models/polo.glb",
    camera: { position: [0, 1.2, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10 },
    scale: 1,
  },
  "legs:pants:basic": {
    src: "/models/pants.glb",
    camera: { position: [0, 1.3, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10 },
    scale: 1,
  },
  "head:cap:basic": {
    src: "/models/cap.glb",
    camera: { position: [0, 0.6, 2.6], fov: 45 },
    controls: { minDistance: 1.2, maxDistance: 5 },
    scale: 1,
  },
};

/* ---------- API ---------- */

export function getModelConfigFromSelection(sel: Selection): ModelConfig {
  const canon = canonicalize(sel);
  const key = keyFrom(canon);
  const cfg = REGISTRY[key];
  // Se não encontrar a seleção específica, usa o modelo padrão
  return cfg ?? REGISTRY["torso:shirt:basic"] ?? {};
}

/**
 * Versão assíncrona: primeiro tenta buscar `model_3d_path` do subtipo
 * correspondente no banco (Supabase). Se encontrar, retorna config com esse path.
 * Caso contrário, fallback para o REGISTRY hardcoded.
 */
const _dbCache = new Map<string, { config: ModelConfig; ts: number }>();
const DB_CACHE_TTL = 60_000; // 1 minuto

export async function getModelConfigFromSelectionAsync(
  sel: Selection,
  supabaseClient: { from: (table: string) => any }
): Promise<ModelConfig> {
  const canon = canonicalize(sel);
  const key = keyFrom(canon);

  // Check cache
  const cached = _dbCache.get(key);
  if (cached && Date.now() - cached.ts < DB_CACHE_TTL) {
    return cached.config;
  }

  // Try to find from DB
  try {
    const subtypeSlug = canon.subtype;
    const typeSlug = canon.type;

    if (subtypeSlug) {
      // Converte para o mesmo formato de slug usado no Admin (hyphens)
      const dbSlug = subtypeSlug
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      let resolvedTypeId: string | null = null;
      if (typeSlug) {
        const dbTypeSlug = typeSlug
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "");
        // Aceita tanto slug quanto nome, para cobrir fluxos que navegam com label.
        let typeLookup = await supabaseClient
          .from("product_types")
          .select("id")
          .eq("slug", dbTypeSlug)
          .maybeSingle();
        if (!typeLookup.data) {
          typeLookup = await supabaseClient
            .from("product_types")
            .select("id")
            .ilike("name", typeSlug)
            .maybeSingle();
        }
        resolvedTypeId = (typeLookup.data?.id as string | undefined) ?? null;
      }

      // Busca subtipo por slug e, se não achar, por nome (resiliente a custom slugs).
      const findSubtypeWithZones = async () => {
        const bySlugQuery = supabaseClient
          .from("product_subtypes")
          .select("model_3d_path, slug, decal_zones_json")
          .eq("slug", dbSlug);
        const bySlug = resolvedTypeId
          ? await bySlugQuery.eq("type_id", resolvedTypeId).maybeSingle()
          : await bySlugQuery.maybeSingle();
        if (bySlug.data) return bySlug;

        const byNameQuery = supabaseClient
          .from("product_subtypes")
          .select("model_3d_path, slug, decal_zones_json")
          .ilike("name", subtypeSlug);
        const byName = resolvedTypeId
          ? await byNameQuery.eq("type_id", resolvedTypeId).maybeSingle()
          : await byNameQuery.maybeSingle();
        return byName;
      };

      const withZones = await findSubtypeWithZones();

      let data = withZones.data as { model_3d_path?: string; decal_zones_json?: unknown } | null;
      if (!data && withZones.error && String(withZones.error.message || "").includes("decal_zones_json")) {
        // Compatibilidade: banco ainda sem a coluna json de zonas.
        const findLegacySubtype = async () => {
          const bySlugQuery = supabaseClient
            .from("product_subtypes")
            .select("model_3d_path, slug")
            .eq("slug", dbSlug);
          const bySlug = resolvedTypeId
            ? await bySlugQuery.eq("type_id", resolvedTypeId).maybeSingle()
            : await bySlugQuery.maybeSingle();
          if (bySlug.data) return bySlug;

          const byNameQuery = supabaseClient
            .from("product_subtypes")
            .select("model_3d_path, slug")
            .ilike("name", subtypeSlug);
          const byName = resolvedTypeId
            ? await byNameQuery.eq("type_id", resolvedTypeId).maybeSingle()
            : await byNameQuery.maybeSingle();
          return byName;
        };

        const legacy = await findLegacySubtype();
        data = legacy.data as { model_3d_path?: string } | null;
      }

      if (data?.model_3d_path) {
        const config: ModelConfig = {
          src: data.model_3d_path,
          camera: { position: [0, 1.5, 5], fov: 45 },
          controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
          scale: 0.8,
          rotation: [0, 0, 0],
          position: [0, 0, 0],
          decalZones: normalizeDbDecalZones(data.decal_zones_json),
        };
        _dbCache.set(key, { config, ts: Date.now() });
        return config;
      }
    }
  } catch (err) {
    console.warn("[models] DB lookup failed, using fallback:", err);
  }

  // Fallback to hardcoded registry
  const fallback = REGISTRY[key] ?? REGISTRY["torso:shirt:basic"] ?? {};
  _dbCache.set(key, { config: fallback, ts: Date.now() });
  return fallback;
}

/** Invalida o cache (usar após upload de novo modelo). */
export function invalidateModelCache(sel?: Selection) {
  if (sel) {
    const key = keyFrom(canonicalize(sel));
    _dbCache.delete(key);
  } else {
    _dbCache.clear();
  }
}


export function hasModelForSelection(sel: Selection): boolean {
  const canon = canonicalize(sel);
  return !!REGISTRY[keyFrom(canon)];
}

export const MODEL_REGISTRY: Readonly<Record<string, ModelConfig>> = REGISTRY;

