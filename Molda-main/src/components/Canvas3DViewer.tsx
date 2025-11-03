import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
// Substituímos o viewer R3F pelo host do decal-engine existente
import DecalEngineHost from "./DecalEngineHost";
// import Model3D from "./Model3D";
// import TShirt3D from "./TShirt3D";               // ✅ caminho corrigido (mesma pasta)
import { getModelConfigFromSelection } from "../lib/models";

type Props = {
  baseColor?: string;
  className?: string;
  externalDecals?: Array<{ id: string; label: string; dataUrl: string }>;
};

export default function Canvas3DViewer({ baseColor = "#ffffff", className, externalDecals = [] }: Props) {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const stateSel = (location.state || {}) as { part?: string; type?: string; subtype?: string } | null;
  const part = stateSel?.part ?? searchParams.get("part") ?? undefined;
  const type = stateSel?.type ?? searchParams.get("type") ?? undefined;
  const subtype = stateSel?.subtype ?? searchParams.get("subtype") ?? undefined;

  const modelConfig = useMemo(
    () => getModelConfigFromSelection({ part, type, subtype }),
    [part, type, subtype]
  );

  // debug removido para evitar dependência de import.meta.env

  // Em vez de reconstruir as funcionalidades, utilizamos o decal-engine diretamente dentro da Tab3D
  return (
    <div className={["relative w-full h-full", className].filter(Boolean).join(" ")}>
      <DecalEngineHost
        className="w-full h-full"
        selection={{ part, type, subtype }}
        decals={externalDecals}
      />
    </div>
  );

}
