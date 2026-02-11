import React, { useEffect, useRef, useState } from "react";
import initDecalDemo, { DecalDemoHandle } from "../../../decal-engine/src/usage";
import { DEFAULT_GIZMO_THEME } from "../../../gizmo-theme";
import { getModelConfigFromSelection } from "../lib/models";
import type { ExternalDecalData } from "../types/decals";

type Selection = { part?: string | null; type?: string | null; subtype?: string | null };

type Props = {
  className?: string;
  selection?: Selection;
  // Decals que já estão no modelo principal (de outras tabs)
  externalDecals?: ExternalDecalData[];
  // Decal da tab atual - não será sincronizado com o modelo principal
  currentTabDecal?: ExternalDecalData | null;
};

/**
 * Componente de preview 3D para exibição dentro de uma tab 2D individual.
 * Mostra o modelo 3D com os decals de outras tabs, mas isolando o decal da tab atual.
 */
export default function Tab3DPreview({
  className,
  selection,
  externalDecals = [],
  currentTabDecal,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);
  const apiRef = useRef<DecalDemoHandle | null>(null);
  const prevExternalIdsRef = useRef<Set<string>>(new Set());
  const prevPayloadsRef = useRef<Map<string, Parameters<DecalDemoHandle["upsertExternalDecal"]>[0]>>(new Map());
  const [ready, setReady] = useState(false);

  const payloadEquals = (
    a: Parameters<DecalDemoHandle["upsertExternalDecal"]>[0] | undefined,
    b: Parameters<DecalDemoHandle["upsertExternalDecal"]>[0] | undefined
  ) => {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (a.label !== b.label) return false;
    if (a.src !== b.src) return false;
    if (a.width !== b.width) return false;
    if (a.height !== b.height) return false;
    if (a.depth !== b.depth) return false;
    if (a.angle !== b.angle) return false;

    const ap = a.position;
    const bp = b.position;
    if (!!ap !== !!bp) return false;
    if (ap && bp) {
      if (ap.x !== bp.x || ap.y !== bp.y || ap.z !== bp.z) return false;
    }

    const an = a.normal;
    const bn = b.normal;
    if (!!an !== !!bn) return false;
    if (an && bn) {
      if (an.x !== bn.x || an.y !== bn.y || an.z !== bn.z) return false;
    }

    return true;
  };

  // Inicializa o engine 3D
  useEffect(() => {
    if (initedRef.current) return;
    if (!containerRef.current) return;
    initedRef.current = true;
    let cancelled = false;

    const cfg = getModelConfigFromSelection({
      part: selection?.part ?? undefined,
      type: selection?.type ?? undefined,
      subtype: selection?.subtype ?? undefined,
    });
    const src = cfg.src || "/models/tshirt-low-poly/scene.gltf";
    const modelParam = src.startsWith("/models/") ? src.replace("/models/", "") : src;

    const mountEl = containerRef.current;
    const boot = async () => {
      try {
        const handle = await initDecalDemo(mountEl, {
          interactive: true,
          background: null,
          gizmoTheme: DEFAULT_GIZMO_THEME,
          model: modelParam,
          hideMenu: true,
        });
        if (cancelled) return;
        apiRef.current = handle;
        setReady(true);
      } catch (err) {
        console.error("Falha ao inicializar preview 3D:", err);
      }
    };
    void boot();

    return () => {
      cancelled = true;
    };
  }, [selection]);

  // Sincroniza decals externos (de outras tabs) com o engine
  useEffect(() => {
    const api = apiRef.current;
    if (!ready || !api) return;

    const currentIds = new Set<string>();
    const payloads: Parameters<DecalDemoHandle["upsertExternalDecal"]>[0][] = [];

    // Inclui apenas decals de outras tabs (não o da tab atual)
    for (const decal of externalDecals) {
      if (!decal.dataUrl || decal.dataUrl === "") continue;
      currentIds.add(decal.id);
      
      const t = decal.transform;
      const payload: Parameters<DecalDemoHandle["upsertExternalDecal"]>[0] = {
        id: decal.id,
        label: decal.label,
        src: decal.dataUrl,
        locked: true,
        position: t?.position ?? undefined,
        normal: t?.normal ?? undefined,
        width: t?.width ?? undefined,
        height: t?.height ?? undefined,
        depth: t?.depth ?? undefined,
        angle: t?.angle ?? undefined,
      };
      payloads.push(payload);
    }

    // Adiciona o decal da tab atual se existir (para visualização)
    if (currentTabDecal && currentTabDecal.dataUrl) {
      currentIds.add(currentTabDecal.id);
      const t = currentTabDecal.transform;
      const payload: Parameters<DecalDemoHandle["upsertExternalDecal"]>[0] = {
        id: currentTabDecal.id,
        label: currentTabDecal.label,
        src: currentTabDecal.dataUrl,
        position: t?.position ?? undefined,
        normal: t?.normal ?? undefined,
        width: t?.width ?? undefined,
        height: t?.height ?? undefined,
        depth: t?.depth ?? undefined,
        angle: t?.angle ?? undefined,
      };
      payloads.push(payload);
    }

    const prevIds = prevExternalIdsRef.current;
    const idsToRemove = Array.from(prevIds).filter((id) => !currentIds.has(id));

    for (const id of idsToRemove) {
      api.removeExternalDecal?.(id);
      prevPayloadsRef.current.delete(id);
    }

    for (const payload of payloads) {
      const prev = prevPayloadsRef.current.get(payload.id);
      if (payloadEquals(prev, payload)) continue;
      api.upsertExternalDecal?.(payload);
      prevPayloadsRef.current.set(payload.id, payload);
    }

    prevExternalIdsRef.current = currentIds;
  }, [ready, externalDecals, currentTabDecal]);

  return (
    <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }}>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80">
          <p className="text-sm text-muted-foreground">Carregando preview 3D...</p>
        </div>
      )}
    </div>
  );
}
