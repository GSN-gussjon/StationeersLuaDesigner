// Mock of the ScriptedScreens `ss.*` API, backed by an in-memory scene graph.
//
// Signatures follow OrbitalFoundryModTeam/ScriptedScreensDocs (surfaces,
// elements, input-events, display-elements, inputs, buttons, toggles, globals).
// The mock builds a tree of elements per surface; commit() emits a snapshot the
// canvas renderer draws, and dispatchEvent() invokes the script's registered
// callback for a given element + event.

import type {
  LayoutMode,
  LayoutOpts,
  LayoutPadding,
  Rect,
  SceneElement,
  SceneSnapshot,
  SsEventKind,
} from "./ssScene";
import { flex, grid } from "./ssLayoutHelpers";

/** A Lua-callable function reference (wasmoon proxies these as JS functions). */
type LuaFn = (...args: unknown[]) => unknown;

/** Internal element record kept between commits. */
interface ElementRecord {
  id: string;
  type: string;
  rect: Rect;
  props: Record<string, unknown>;
  style: Record<string, unknown>;
  parentId: string | null;
  order: number;
  data: number[];
  capacity: number;
  handlers: { click?: LuaFn; change?: LuaFn; toggle?: LuaFn };
  /** Auto-layout mode when this element arranges its children (from ui:layout). */
  layout?: LayoutMode;
  /** Auto-layout options (when `layout` is set). */
  layoutOpts?: LayoutOpts;
  /** Flex grow factor within a laid-out parent. */
  flexN?: number;
}

/** Host bindings so the mock can surface commits and log. */
export interface SsHostBindings {
  /** Called on every ui:commit() with the active surface snapshot. */
  onCommit: (snapshot: SceneSnapshot) => void;
  log: (kind: "log" | "error" | "info", text: string) => void;
  /** Physical screen size to report from ui:size(). */
  screenSize?: { w: number; h: number };
}

const DEFAULT_SIZE = { w: 480, h: 272 };
const DEFAULT_CAPACITY = 64;

function toNumber(v: unknown, dflt = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : dflt;
}

/**
 * Read layout options from a `ui:layout` node definition (Lua keys:
 * direction/gap/padding/align/justify/cols/row_height). Mirrors the option set
 * documented for surface:layout / ss.ui.flex / ss.ui.grid.
 */
function readLayoutOptsFromDef(def: Record<string, unknown>): LayoutOpts {
  const opts: LayoutOpts = {};
  const dir = def.direction;
  if (dir === "row" || dir === "column") opts.direction = dir;
  const align = def.align;
  if (align === "stretch" || align === "start" || align === "center" || align === "end")
    opts.align = align;
  const justify = def.justify;
  if (
    justify === "start" ||
    justify === "center" ||
    justify === "end" ||
    justify === "between" ||
    justify === "evenly"
  )
    opts.justify = justify;
  if (def.gap != null) opts.gap = toNumber(def.gap);
  if (def.cols != null) opts.cols = toNumber(def.cols);
  if (def.row_height != null) opts.rowHeight = toNumber(def.row_height);
  if (def.padding != null) {
    if (typeof def.padding === "number") opts.padding = def.padding;
    else if (typeof def.padding === "object") {
      const p = def.padding as Record<string, unknown>;
      const side: LayoutPadding = {
        top: p.top != null ? toNumber(p.top) : undefined,
        right: p.right != null ? toNumber(p.right) : undefined,
        bottom: p.bottom != null ? toNumber(p.bottom) : undefined,
        left: p.left != null ? toNumber(p.left) : undefined,
      };
      opts.padding = side;
    }
  }
  return opts;
}

function resolveZ(props: Record<string, unknown>): number {
  const z = props.z_index ?? props.zIndex;
  return toNumber(z, 0);
}

/**
 * An icon table whose members resolve to a stable string name, e.g.
 * ss.ui.icons.gas.Oxygen -> "gas:Oxygen". The renderer treats icons as
 * labeled placeholders, so any consistent string is sufficient.
 */
function iconProxy(kind: string): Record<string, string> {
  return new Proxy(
    {},
    {
      get: (_t, prop) =>
        typeof prop === "string" ? `${kind}:${prop}` : String(prop),
    }
  );
}

export function buildSsApi(bindings: SsHostBindings): {
  ss: Record<string, unknown>;
  /** Dispatch a UI event into the script (called by the renderer). */
  dispatchEvent: (
    elementId: string,
    kind: SsEventKind,
    value?: string
  ) => void;
} {
  const screen = bindings.screenSize ?? DEFAULT_SIZE;

  // One surface is enough for the preview; multiple named surfaces are tracked
  // but only the active one is rendered (matching in-game behavior).
  const surfaces = new Map<string, Map<string, ElementRecord>>();
  let activeSurface = "main";
  let orderSeq = 0;

  const ensureSurface = (name: string): Map<string, ElementRecord> => {
    let s = surfaces.get(name);
    if (!s) {
      s = new Map();
      surfaces.set(name, s);
    }
    return s;
  };

  /**
   * Normalize an element definition table coming from Lua. Wasmoon hands tables
   * to JS as plain objects; nested rect/props/style are objects too.
   */
  const readDef = (
    def: Record<string, unknown>,
    parentId: string | null
  ): ElementRecord => {
    const rawId = String(def.id ?? "");
    const id = parentId ? `${parentId}/${rawId}` : rawId;
    const rectRaw = (def.rect ?? {}) as Record<string, unknown>;
    const rect: Rect = {
      unit: (rectRaw.unit as Rect["unit"]) ?? "px",
      x: toNumber(rectRaw.x),
      y: toNumber(rectRaw.y),
      w: toNumber(rectRaw.w),
      h: toNumber(rectRaw.h),
    };
    const props = (def.props ?? {}) as Record<string, unknown>;
    const style = (def.style ?? {}) as Record<string, unknown>;

    const handlers: ElementRecord["handlers"] = {};
    if (typeof def.on_click === "function") handlers.click = def.on_click as LuaFn;
    if (typeof def.on_change === "function")
      handlers.change = def.on_change as LuaFn;
    if (typeof def.on_toggle === "function")
      handlers.toggle = def.on_toggle as LuaFn;

    const rec: ElementRecord = {
      id,
      type: String(def.type ?? "panel"),
      rect,
      props,
      style,
      parentId,
      order: orderSeq++,
      data: [],
      capacity: toNumber(props.capacity, DEFAULT_CAPACITY),
      handlers,
    };

    // Auto-layout container metadata (present on ui:layout nodes).
    const layout = def.layout;
    if (layout === "flex" || layout === "grid" || layout === "row" || layout === "column") {
      // "row"/"column" are shorthand for flex + direction (per docs).
      rec.layout = layout === "grid" ? "grid" : "flex";
      const opts = readLayoutOptsFromDef(def);
      if (layout === "row") opts.direction = opts.direction ?? "row";
      if (layout === "column") opts.direction = opts.direction ?? "column";
      rec.layoutOpts = opts;
    }
    // Flex grow factor for a child inside a laid-out parent.
    if (def.flex != null) {
      const fl = toNumber(def.flex);
      if (fl > 0) rec.flexN = fl;
    }

    return rec;
  };

  /** Build a handle table (Lua-facing) for an element on a given surface. */
  const makeHandle = (
    surfaceName: string,
    id: string
  ): Record<string, unknown> => {
    const surface = ensureSurface(surfaceName);

    const handle: Record<string, unknown> = {
      id,
      set_props: (patch: Record<string, unknown>) => {
        const rec = surface.get(id);
        if (rec && patch) {
          rec.props = { ...rec.props, ...patch };
          if (patch.capacity !== undefined)
            rec.capacity = toNumber(patch.capacity, DEFAULT_CAPACITY);
        }
        return handle;
      },
      set_style: (patch: Record<string, unknown>) => {
        const rec = surface.get(id);
        if (rec && patch) rec.style = { ...rec.style, ...patch };
        return handle;
      },
      // Charts: append one sample per series arg, keep a rolling window.
      push: (...values: unknown[]) => {
        const rec = surface.get(id);
        if (!rec) return handle;
        // Sparkline pushes a single value; multi-series charts push several.
        // We store a flat rolling buffer of the first value for the preview.
        const v = toNumber(values[0]);
        rec.data.push(v);
        while (rec.data.length > rec.capacity) rec.data.shift();
        return handle;
      },
      on: (event: string, fn: LuaFn | null) => {
        const rec = surface.get(id);
        if (rec) {
          if (event === "click") rec.handlers.click = fn ?? undefined;
          else if (event === "change") rec.handlers.change = fn ?? undefined;
          else if (event === "toggle") rec.handlers.toggle = fn ?? undefined;
        }
        return handle;
      },
      off: (event: string) => {
        const rec = surface.get(id);
        if (rec) {
          if (event === "click") rec.handlers.click = undefined;
          else if (event === "change") rec.handlers.change = undefined;
          else if (event === "toggle") rec.handlers.toggle = undefined;
        }
        return handle;
      },
      // Nested child: id is prefixed with this element's id.
      element: (childDef: Record<string, unknown>) => {
        const rec = readDef(childDef, id);
        surface.set(rec.id, rec);
        return makeHandle(surfaceName, rec.id);
      },
    };
    return handle;
  };

  /** Build the surface handle (ui) for a named surface. */
  const makeSurfaceHandle = (name: string): Record<string, unknown> => {
    const surface = ensureSurface(name);

    const ui: Record<string, unknown> = {
      element: (def: Record<string, unknown>) => {
        const rec = readDef(def, null);
        surface.set(rec.id, rec);
        return makeHandle(name, rec.id);
      },
      get: (id: string) => (surface.has(id) ? makeHandle(name, id) : null),
      remove: (id: string) => {
        surface.delete(id);
        // Also remove nested children (id/...).
        for (const key of [...surface.keys()]) {
          if (key.startsWith(id + "/")) surface.delete(key);
        }
      },
      clear: () => surface.clear(),
      size: () => ({ w: screen.w, h: screen.h }),
      commit: () => {
        if (name === activeSurface) bindings.onCommit(snapshotSurface(name));
      },
      // surface:layout(def) — recursively process a nested layout tree, storing
      // each node as an element. Child rects are computed by the preview's
      // layout engine (ssLayout) from the container's layout/layoutOpts. Returns
      // a handles table mapping each element id to its handle (per docs).
      layout: (def: Record<string, unknown>) => {
        const handles: Record<string, unknown> = {};
        const walk = (
          node: Record<string, unknown>,
          parentId: string | null
        ): void => {
          const hasId = def != null && node.id != null && String(node.id) !== "";
          let selfId: string | null = parentId;
          if (hasId) {
            const rec = readDef(node, parentId);
            surface.set(rec.id, rec);
            handles[String(node.id)] = makeHandle(name, rec.id);
            selfId = rec.id;
          }
          const children = node.children;
          if (Array.isArray(children)) {
            for (const child of children) {
              if (child && typeof child === "object") {
                walk(child as Record<string, unknown>, selfId);
              }
            }
          }
        };
        if (def && typeof def === "object") walk(def, null);
        return handles;
      },
      measure_text: (
        text: unknown,
        maxWidth: unknown,
        fontSize: unknown
      ) => {
        // Approximate: ~0.55em per char width, fontSize line height.
        const fs = toNumber(fontSize, 16);
        const t = String(text ?? "");
        const w = Math.min(
          t.length * fs * 0.55,
          toNumber(maxWidth, 0) || Number.MAX_SAFE_INTEGER
        );
        return { w, h: fs * 1.3 };
      },
      // Keyboard / frame hooks are accepted but not simulated in the preview.
      on_keydown: () => {},
      on_keyup: () => {},
      on_frame: () => {},
      poll_input: () => [],
      on_drag: () => {},
      on_move: () => {},
      on_resize: () => {},
      on_layout: () => {},
      is_dragging: () => false,
      is_resizing: () => false,
      drag_offset: () => ({ x: 0, y: 0 }),
      panel_size: () => null,
    };
    return ui;
  };

  const snapshotSurface = (name: string): SceneSnapshot => {
    const surface = ensureSurface(name);
    const elements: SceneElement[] = [...surface.values()].map((rec) => ({
      id: rec.id,
      type: rec.type,
      rect: rec.rect,
      props: rec.props,
      style: rec.style,
      parentId: rec.parentId,
      z: resolveZ(rec.props),
      order: rec.order,
      data: rec.data.length ? [...rec.data] : undefined,
      events: {
        click: !!rec.handlers.click,
        change: !!rec.handlers.change,
        toggle: !!rec.handlers.toggle,
      },
      layout: rec.layout,
      layoutOpts: rec.layoutOpts,
      flexN: rec.flexN,
    }));
    return { surface: name, width: screen.w, height: screen.h, elements };
  };

  const dispatchEvent = (
    elementId: string,
    kind: SsEventKind,
    value?: string
  ): void => {
    const surface = ensureSurface(activeSurface);
    const rec = surface.get(elementId);
    if (!rec) return;
    const fn = rec.handlers[kind];
    if (!fn) return;
    try {
      // Arg conventions from docs:
      //  click: (playerName) or (value, playerName) when props.value set
      //  change/toggle: (value, playerName)
      const player = "SimPlayer";
      if (kind === "click") {
        if (value !== undefined || rec.props.value !== undefined) {
          fn(value ?? String(rec.props.value ?? ""), player);
        } else {
          fn(player);
        }
      } else {
        fn(value ?? "", player);
      }
    } catch (e) {
      bindings.log(
        "error",
        `${kind} handler error on ${elementId}: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  };

  // ---- ss root table ----
  const ss: Record<string, unknown> = {
    ui: {
      surface: (name: unknown) => makeSurfaceHandle(String(name ?? "main")),
      activate: (name: unknown) => {
        activeSurface = String(name ?? "main");
        // Re-emit the newly active surface so the preview switches.
        bindings.onCommit(snapshotSurface(activeSurface));
      },
      // Layout helpers: compute child rects and return the child defs.
      flex: (opts: unknown, children: unknown) => flex(opts, children),
      grid: (opts: unknown, children: unknown) => grid(opts, children),
      // Icon name tables: reading any member yields its own name as a string,
      // matching how scripts pass ss.ui.icons.gas.Oxygen as an icon name.
      icons: {
        gas: iconProxy("gas"),
        slot: iconProxy("slot"),
        prefab: iconProxy("prefab"),
      },
    },
    direction: {
      LeftToRight: "ltr",
      RightToLeft: "rtl",
      TopToBottom: "ttb",
      BottomToTop: "btt",
    },
    sounds: new Proxy(
      { alerts: new Proxy({}, { get: (_t, p) => String(p) }) },
      { get: (t, p) => (p in t ? (t as never)[p] : String(p)) }
    ),
    play_sound: (name: unknown) =>
      bindings.log("info", `ss.play_sound(${String(name)})`),
    stop_sound: () => {},
    is_interface_mode: () => false,
    exit_interface_mode: () => {},
    pin_label: () => {},
  };

  return { ss, dispatchEvent };
}
