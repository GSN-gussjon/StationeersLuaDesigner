// Shared scene-graph types for the ScriptedScreens (ss.*) mock and the canvas
// renderer. The mock produces a SceneSnapshot on commit(); the renderer draws
// it and routes pointer events back to element callbacks by id.

export interface Rect {
  unit: "px" | "%" | "percent";
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Auto-layout mode for a container element (undefined = absolute positioning). */
export type LayoutMode = "flex" | "grid";

/** Padding as a uniform number or per-side. */
export type LayoutPadding =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

/**
 * Options for a container that lays its children out automatically. Mirrors the
 * ScriptedScreens `surface:layout` / `ss.ui.flex` / `ss.ui.grid` option set.
 */
export interface LayoutOpts {
  /** Flex main-axis direction. Ignored for grid. */
  direction?: "row" | "column";
  /** Gap between children in pixels. */
  gap?: number;
  /** Inset from the container edges. */
  padding?: LayoutPadding;
  /** Flex cross-axis alignment. */
  align?: "stretch" | "start" | "center" | "end";
  /** Flex main-axis distribution. */
  justify?: "start" | "center" | "end" | "between" | "evenly";
  /** Grid column count. */
  cols?: number;
  /** Grid fixed row height (square cells if omitted). */
  rowHeight?: number;
}

/** A single element in the committed scene. Props/style are passed through
 *  verbatim from Lua so the renderer can read documented keys per type. */
export interface SceneElement {
  /** Fully-qualified id (parent-prefixed for nested elements). */
  id: string;
  type: string;
  rect: Rect;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  /** Parent element id, or null for surface-root children. */
  parentId: string | null;
  /** z-index resolved from props.z_index / props.zIndex (default 0). */
  z: number;
  /** Insertion order, used as a tiebreaker when z is equal. */
  order: number;
  /** For charts: the rolling data buffer fed via handle:push. */
  data?: number[];
  /** Which event handlers this element has registered (for hit-testing). */
  events: { click: boolean; change: boolean; toggle: boolean };
  /** Auto-layout mode when this element arranges its children. */
  layout?: LayoutMode;
  /** Auto-layout options (when `layout` is set). */
  layoutOpts?: LayoutOpts;
  /**
   * Flex grow factor within a laid-out parent. When >0 the child grows to fill
   * available main-axis space; otherwise its fixed rect w/h is used.
   */
  flexN?: number;
}

export interface SceneSnapshot {
  surface: string;
  width: number;
  height: number;
  elements: SceneElement[];
}

/** Event kinds the renderer can dispatch back into the running script. */
export type SsEventKind = "click" | "change" | "toggle";
