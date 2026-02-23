// src/lib/models.ts
export type Selection = {
  part?: string | null;
  type?: string | null;
  subtype?: string | null;
};

export type ModelConfig = {
  src?: string; // Ex.: "/models/tshirt/scene.gltf" ou ".glb"
  camera?: { position?: [number, number, number]; fov?: number };
  controls?: { maxDistance?: number; minDistance?: number; enableZoom?: boolean; enablePan?: boolean };
  scale?: number | [number, number, number];
  rotation?: [number, number, number];
  position?: [number, number, number];
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

    if (subtypeSlug) {
      // Converte para o mesmo formato de slug usado no Admin (hyphens)
      const dbSlug = subtypeSlug
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, "");

      // Busca subtipo pelo slug
      const { data } = await supabaseClient
        .from("product_subtypes")
        .select("model_3d_path, slug")
        .eq("slug", dbSlug)
        .maybeSingle();

      if (data?.model_3d_path) {
        const config: ModelConfig = {
          src: data.model_3d_path,
          camera: { position: [0, 1.5, 5], fov: 45 },
          controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
          scale: 0.8,
          rotation: [0, 0, 0],
          position: [0, 0, 0],
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

