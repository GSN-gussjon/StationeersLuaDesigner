// Data model for the layout designer.
//
// A DesignControl is the designer's editable equivalent of a scene element:
// id, type, rect, props, style, parent, plus which event handlers the user
// wants generated. The designer keeps a flat list (parent relationships are
// expressed via parentId), mirroring how the ss mock stores elements.

import type {
  LayoutMode,
  LayoutOpts,
  Rect,
  SceneElement,
  SceneSnapshot,
} from "../runtime/ssScene";
import { WIDGET_BY_TYPE } from "./widgetSchema";

export type EventKind = "click" | "change" | "toggle";

/**
 * Event handlers as WinForms-style function references: each event maps to the
 * name of the Lua function it's wired to (empty string = not wired). The
 * generator emits `on_<ev> = <name>` and adds an empty stub for that name.
 */
export type HandlerMap = Record<EventKind, string>;

/** An unwired handler map (all events empty). */
export function emptyHandlers(): HandlerMap {
  return { click: "", change: "", toggle: "" };
}

/**
 * Coerce a possibly-legacy handler map (older saves used booleans) into the
 * string-based form. A `true` becomes an auto-generated name; anything else
 * keeps its string value (or empty).
 */
export function normalizeHandlers(
  raw: unknown,
  controlId: string
): HandlerMap {
  const out = emptyHandlers();
  const src = (raw ?? {}) as Record<string, unknown>;
  (["click", "change", "toggle"] as EventKind[]).forEach((ev) => {
    const v = src[ev];
    if (typeof v === "string") out[ev] = v;
    else if (v === true) out[ev] = autoHandlerName(controlId, ev);
    // false / undefined -> stays empty
  });
  return out;
}

export interface DesignControl {
  id: string;
  type: string;
  rect: Rect;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  /** Parent control id, or null for root-level controls. */
  parentId: string | null;
  /** z-index within the parent (draw order). */
  z: number;
  /** Insertion order tiebreaker. */
  order: number;
  /** Event -> Lua handler function name (empty = not wired). */
  handlers: HandlerMap;
  /**
   * Auto-layout mode when this control arranges its children (flex/grid).
   * Undefined = absolute positioning (children keep their own rect x/y).
   */
  layout?: LayoutMode;
  /** Auto-layout options (used when `layout` is set). */
  layoutOpts?: LayoutOpts;
  /**
   * Flex grow factor within a laid-out parent (0/undefined = fixed size from
   * rect w/h). Meaningful only when this control's parent has `layout` set.
   */
  flexN?: number;
}

/** Suggested handler function name for a control + event (e.g. onBtn1Click). */
export function autoHandlerName(controlId: string, ev: EventKind): string {
  const base = controlId.replace(/[^A-Za-z0-9_]/g, "_");
  const verb = ev[0].toUpperCase() + ev.slice(1);
  return `on${base[0].toUpperCase()}${base.slice(1)}${verb}`;
}

/**
 * Normalize a control list into a stable signature for the Design <-> Script
 * sync bridge (a change only propagates when the normalized content differs).
 *
 * It must be symmetric across the round-trip: the designer keeps a control's
 * default-valued fields (e.g. font_size: 16), but the Lua generator omits
 * style fields that equal their default, so the parser reads them back absent.
 * To make both sides compare equal, the signature drops any prop/style value
 * that equals its schema default — the meaningful content is identical either
 * way. Insertion `order` is ignored (the parser re-assigns it).
 */
export function controlsSignature(controls: DesignControl[]): string {
  const norm = controls
    .map((c) => ({
      id: c.id,
      type: c.type,
      rect: c.rect,
      props: meaningfulEntries(c.type, c.props, "props"),
      style: meaningfulEntries(c.type, c.style, "style"),
      parentId: c.parentId,
      z: c.z,
      handlers: c.handlers,
      // Layout metadata participates in the sync signature so flex/grid edits
      // propagate Design -> Script. Normalize empties to keep it symmetric with
      // the parser (which omits absent/zero values).
      layout: c.layout ?? null,
      layoutOpts: normalizeLayoutOpts(c.layoutOpts),
      flexN: c.flexN && c.flexN > 0 ? c.flexN : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(norm);
}

/**
 * Sorted [key,value] entries with undefined dropped and — critically — values
 * equal to their schema default removed, so a control with a default-valued
 * field and one without normalize identically.
 */
function meaningfulEntries(
  type: string,
  obj: Record<string, unknown>,
  group: "props" | "style"
): [string, unknown][] {
  const def = WIDGET_BY_TYPE.get(type);
  const defaults = new Map<string, unknown>();
  if (def) {
    for (const fd of def.fields) {
      if (fd.group === group) defaults.set(fd.key, fd.default);
    }
  }
  return Object.entries(obj)
    .filter(([k, v]) => {
      if (v === undefined) return false;
      // Drop values equal to the schema default (symmetric with the generator).
      if (defaults.has(k) && v === defaults.get(k)) return false;
      // Drop empty strings (also dropped by the generator).
      if (typeof v === "string" && v.trim() === "") return false;
      return true;
    })
    .sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Normalize layout options into a stable, comparison-friendly shape: drop
 * undefined fields and coalesce so two equivalent option sets serialize
 * identically in the sync signature. Returns null when there's nothing set.
 */
function normalizeLayoutOpts(opts: LayoutOpts | undefined): LayoutOpts | null {
  if (!opts) return null;
  const out: Record<string, unknown> = {};
  const keys: (keyof LayoutOpts)[] = [
    "direction",
    "gap",
    "padding",
    "align",
    "justify",
    "cols",
    "rowHeight",
  ];
  for (const k of keys) {
    const v = opts[k];
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as LayoutOpts) : null;
}

let idSeq = 0;
/** Generate a short unique control id (also used as the Lua element id). */
export function nextControlId(type: string): string {
  idSeq += 1;
  return `${type}${idSeq}`;
}

/**
 * After loading controls (e.g. restored from a script), advance the id counter
 * past any numeric suffix already in use so freshly-added controls don't get a
 * colliding id like "label1".
 */
export function bumpIdSeqPast(controls: DesignControl[]): void {
  for (const c of controls) {
    const m = /(\d+)$/.exec(c.id);
    if (m) idSeq = Math.max(idSeq, Number(m[1]));
  }
}

let orderSeq = 0;
export function nextOrder(): number {
  orderSeq += 1;
  return orderSeq;
}

/**
 * Map the designer's controls into a SceneSnapshot so the existing canvas
 * renderer (ssDraw + ssLayout) can draw them exactly as they'll appear at
 * runtime. Handler flags become the events object the renderer reads.
 */
export function controlsToScene(
  controls: DesignControl[],
  board: { w: number; h: number }
): SceneSnapshot {
  const elements: SceneElement[] = controls.map((c) => ({
    id: c.id,
    type: c.type,
    rect: c.rect,
    props: c.props,
    style: c.style,
    parentId: c.parentId,
    z: c.z,
    order: c.order,
    events: {
      click: c.handlers.click !== "",
      change: c.handlers.change !== "",
      toggle: c.handlers.toggle !== "",
    },
    layout: c.layout,
    layoutOpts: c.layoutOpts,
    flexN: c.flexN,
  }));
  return { surface: "design", width: board.w, height: board.h, elements };
}

/** Absolute rect of a control on the board, resolving nested parent offsets. */
export function absoluteRect(
  control: DesignControl,
  byId: Map<string, DesignControl>
): { x: number; y: number; w: number; h: number } {
  let x = control.rect.x;
  let y = control.rect.y;
  let p = control.parentId ? byId.get(control.parentId) : undefined;
  const guard = new Set<string>();
  while (p && !guard.has(p.id)) {
    guard.add(p.id);
    x += p.rect.x;
    y += p.rect.y;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  return { x, y, w: control.rect.w, h: control.rect.h };
}
