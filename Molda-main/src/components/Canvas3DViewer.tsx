import { useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import Model3D from "./Model3D";
import TShirt3D from "./TShirt3D";               // ✅ caminho corrigido (mesma pasta)
import { getModelConfigFromSelection } from "../lib/models";

type Props = {
  baseColor?: string;
  className?: string;
};

export default function Canvas3DViewer({ baseColor = "#ffffff", className }: Props) {
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

  if (import.meta.env.DEV) {
    // ajuda a verificar por que o registry não casou
    // eslint-disable-next-line no-console
    console.log("[Canvas3DViewer] seleção:", { part, type, subtype }, "=> modelConfig:", modelConfig);
  }

  if (!modelConfig?.src) {
    // Fallback preservando o comportamento antigo
    return (
      <div className={["relative w-full h-full", className].filter(Boolean).join(" ")}>
        <TShirt3D color={baseColor} />
      </div>
    );
  }

return (
  <Model3D
    key={modelConfig.src}              // <- força recriar quando o src muda
    className={className || "w-full h-full"}
    src={modelConfig.src}
    baseColor={baseColor}
    camera={modelConfig.camera}
    controls={modelConfig.controls}
    scale={modelConfig.scale}
    rotation={modelConfig.rotation}
    position={modelConfig.position}
    envPreset="studio"
    showControlsButton
    autoRotate
  />
);

}
