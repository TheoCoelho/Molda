export type Vector3Like = {
  x: number;
  y: number;
  z: number;
};

export type DecalTransform = {
  position?: Vector3Like | null;
  normal?: Vector3Like | null;
  width?: number;
  height?: number;
  depth?: number;
  angle?: number;
};

export type ExternalDecalData = {
  id: string;
  label?: string;
  dataUrl: string;
  transform?: DecalTransform | null;
};

export type DecalStateSnapshot = {
  id: string;
  position?: Vector3Like | null;
  normal?: Vector3Like | null;
  width?: number;
  height?: number;
  depth?: number;
  angle?: number;
  viability?: {
    approxAreaCm2?: number;
    normalizedPosition?: {
      x?: number;
      y?: number;
      z?: number;
    } | null;
    warnings?: string[];
  } | null;
};
