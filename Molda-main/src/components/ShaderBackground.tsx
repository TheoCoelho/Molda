// src/components/ShaderBackground.tsx
import React from "react";
import { ShaderGradientCanvas, ShaderGradient } from "@shadergradient/react";
import * as reactSpring from "@react-spring/three"; // mantido para compatibilidade interna

const SHADER_URL =
  "https://www.shadergradient.co/customize?animate=on&axesHelper=on&bgColor1=%23000000&bgColor2=%23000000&brightness=1.1&cAzimuthAngle=180&cDistance=3.9&cPolarAngle=115&cameraZoom=1&color1=%23ffef0d&color2=%23003bfe&color3=%23fe2600&destination=onCanvas&embedMode=off&envPreset=city&format=gif&fov=40&frameRate=10&grain=off&lightType=3d&pixelDensity=1&positionX=-0.5&positionY=0.1&positionZ=0&range=enabled&rangeEnd=40&rangeStart=0&reflection=0.1&rotationX=0&rotationY=0&rotationZ=235&shader=defaults&type=waterPlane&uAmplitude=0&uDensity=1.9&uFrequency=5.5&uSpeed=0.1&uStrength=2.5&uTime=0.2&wireframe=false";

export default function ShaderBackground() {
  return (
    <ShaderGradientCanvas
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
        pointerEvents: "none", // não bloqueia interações do app
      }}
    >
      {/* Lendo configurações direto da URL do configurador */}
      <ShaderGradient control="query" urlString={SHADER_URL} />
    </ShaderGradientCanvas>
  );
}
