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
  premium: ["premium"],
  classic: ["classic", "classica", "clássica"],
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
  // Camiseta básica (o seu .gltf em pasta)
  "torso:shirt:basic": {
    src: "/models/tshirt/scene.gltf",
    camera: { position: [0, 1.2, 5], fov: 45 },
    controls: { minDistance: 3, maxDistance: 10, enableZoom: true, enablePan: false },
    scale: 1,
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

  if (!cfg && import.meta.env.DEV) {
    // Ajuda no debug (mostra origem e a normalização)
    // eslint-disable-next-line no-console
    console.warn("[models] chave não encontrada (normalizada):", key, "· original:", keyFrom(sel));
  }
  return cfg ?? {};
}

export function hasModelForSelection(sel: Selection): boolean {
  const canon = canonicalize(sel);
  return !!REGISTRY[keyFrom(canon)];
}

export const MODEL_REGISTRY: Readonly<Record<string, ModelConfig>> = REGISTRY;
