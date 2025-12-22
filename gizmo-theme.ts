export type GizmoTheme = {
  /** Cor principal usada nos contornos e alças selecionadas. */
  primary: string;
  /** Cor alternativa usada em estados menos agressivos (handles auxiliares, hovers, etc). */
  secondary: string;
  /** Cor do traçado das alças e dos contornos do gizmo. */
  stroke: string;
  /** Preenchimento translúcido aplicado ao retângulo do gizmo. */
  areaFill: string;
  /** Raio base (em pixels) dos controles do gizmo. */
  handleRadius: number;
};

export const DEFAULT_GIZMO_THEME: GizmoTheme = {
  primary: "#38bdf8",
  secondary: "#63a4ff",
  stroke: "#0f172a",
  areaFill: "rgba(56, 189, 248, 0.12)",
  handleRadius: 6,
};

export function resolveGizmoTheme(override?: Partial<GizmoTheme>): GizmoTheme {
  if (!override || !Object.keys(override).length) {
    return DEFAULT_GIZMO_THEME;
  }
  return {
    ...DEFAULT_GIZMO_THEME,
    ...override,
  };
}

export function applyGizmoThemeToFabric(fabric: any, theme: GizmoTheme = DEFAULT_GIZMO_THEME) {
  if (!fabric || !fabric.Object || !fabric.Object.prototype) return;
  if ((fabric as any).__moldaGizmoThemeApplied) return;
  const proto = fabric.Object.prototype as any;
  proto.__moldaGizmoThemeApplied = true;
  try {
    proto.cornerStyle = "circle";
    proto.cornerColor = theme.primary;
    proto.cornerStrokeColor = theme.stroke;
    proto.cornerSize = theme.handleRadius * 2;
    proto.rotatingPointOffset = theme.handleRadius * 2;
    proto.borderColor = theme.primary;
    proto.borderDashArray = [4, 2];
    proto.cornerDashArray = [0, 0];
    proto.transparentCorners = false;
    proto.selectionColor = theme.areaFill;
    proto.selectionBorderColor = theme.primary;
    proto.selectionLineWidth = 2;
    proto.selectionDashArray = [4, 2];
  } catch (error) {
    console.warn("Failed to apply gizmo defaults to Fabric prototype", error);
  }
}
