import React, { useEffect, useRef, useState } from "react";
// Reutiliza o decal-engine diretamente, sem reimplementar
// Importa a função de inicialização existente
// Caminho relativo do projeto Molda-main/src/components -> ../../.. -> decal-engine/src/usage.ts
import initDecalDemo, { DecalDemoHandle } from "../../../decal-engine/src/usage";
import { getModelConfigFromSelection } from "../lib/models";

type Selection = { part?: string | null; type?: string | null; subtype?: string | null };
type ExternalDecal = { id: string; label: string; dataUrl: string };

type Props = { className?: string; selection?: Selection; decals?: ExternalDecal[] };

export default function DecalEngineHost({ className, selection, decals = [] }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const initedRef = useRef(false);
  const apiRef = useRef<DecalDemoHandle | null>(null);
  const prevExternalIdsRef = useRef<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (initedRef.current) return; // inicializa apenas uma vez por montagem
    if (!containerRef.current) return;
    initedRef.current = true;
    let cancelled = false;

    // Escolhe o modelo com base na seleção inicial do Molda-main
    const cfg = getModelConfigFromSelection({
      part: selection?.part ?? undefined,
      type: selection?.type ?? undefined,
      subtype: selection?.subtype ?? undefined,
    });
    const src = cfg.src || "/models/tshirt-low-poly/scene.gltf";
    // usage.ts espera caminho relativo a /models
    const modelParam = src.startsWith("/models/") ? src.replace("/models/", "") : src;
    const url = new URL(window.location.href);
    url.searchParams.set("model", modelParam);
    url.searchParams.set("hideMenu", "1"); // oculta menu interno de seleção
    window.history.replaceState(null, "", url.toString());

    const mountEl = containerRef.current;
    const boot = async () => {
      try {
        const handle = await initDecalDemo(mountEl);
        if (cancelled) return;
        apiRef.current = handle;
        setReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Falha ao inicializar decal-engine:", err);
      }
    };
    void boot();

    return () => {
      cancelled = true;
    };
  }, [selection?.part, selection?.type, selection?.subtype]);

  useEffect(() => {
    if (!ready) return;
    const api = apiRef.current;
    if (!api) return;

    const nextIds = new Set(decals.map((d) => d.id));

    prevExternalIdsRef.current.forEach((id) => {
      if (!nextIds.has(id)) {
        api.removeExternalDecal(id);
      }
    });

    decals.forEach((decal) => {
      if (!decal?.id || !decal?.dataUrl) return;
      api.upsertExternalDecal({ id: decal.id, label: decal.label, src: decal.dataUrl });
    });

    prevExternalIdsRef.current = nextIds;
  }, [decals, ready]);

  useEffect(() => {
    return () => {
      const api = apiRef.current;
      if (api) {
        prevExternalIdsRef.current.forEach((id) => api.removeExternalDecal(id));
      }
      prevExternalIdsRef.current = new Set();
      apiRef.current = null;
      initedRef.current = false;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={className || "w-full h-full"}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}
    />
  );
}
