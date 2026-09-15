// Generate a ScriptedScreens Lua script from the designer's control tree.
//
// Output shape:
//   local ui = ss.ui.surface("main")
//   ss.ui.activate("main")
//   ui:clear()
//   local <containerId> = ui:element({ ... })      -- containers get a local
//   <containerId>:element({ ... })                 -- children use the parent
//   ui:element({ ... })                            -- root leaf controls
//   ui:commit()
//
// Only non-default props/style are emitted (compared to the widget schema).
// Enum/number/bool/string fields are formatted per their schema type; the
// pipe/comma "array" fields (select.options, barchart labels/values) become
// Lua tables. Optional on_click/on_change/on_toggle stubs are added when the
// control has the matching handler flag set.

import type { DesignControl } from "./designerModel";
import type { LayoutOpts } from "../runtime/ssScene";
import { WIDGET_BY_TYPE, emittedType, type FieldDef, type WidgetDef } from "./widgetSchema";
import { parseIconValue } from "./iconCatalog";

interface GenOptions {
  surface?: string;
}

/** Escape a Lua string literal. */
function luaStr(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/** Format a scalar value for Lua based on the field type. */
function formatScalar(fd: FieldDef, value: unknown): string {
  switch (fd.type) {
    case "number":
      return String(Number(value));
    case "bool":
      // Docs express booleans as "true"/"false" strings on props like checked,
      // value(toggle), show_grid, etc. Emit real Lua booleans for clarity;
      // ScriptedScreens accepts both, and true/false reads cleaner.
      return value ? "true" : "false";
    case "enum":
    case "text":
    case "multiline":
    default:
      return luaStr(String(value ?? ""));
  }
}

/** Fields whose text value is a delimiter-separated list → Lua array. */
export function isArrayField(type: string, key: string): "pipe" | "comma" | null {
  if (type === "select" && key === "options") return "pipe";
  if (type === "barchart" && key === "labels") return "pipe";
  if (type === "barchart" && key === "values") return "comma";
  if (type === "barchart" && key === "colors") return "pipe";
  if (type === "table" && key === "columns") return "pipe";
  if (type === "table" && key === "col_widths") return "comma";
  if (type === "linechart" && (key === "series_colors" || key === "series_labels" || key === "x_labels"))
    return "pipe";
  // drop_accepts is a payload whitelist; emit a Lua array. Applies to the
  // drag/drop-capable widgets (panel, button, icon).
  if (key === "drop_accepts" && (type === "panel" || type === "button" || type === "icon"))
    return "pipe";
  return null;
}

/**
 * progress `color_stops` is an array of `{ fraction, "#color" }` pairs. Authors
 * enter it as `frac:color|frac:color` in the designer; emit the nested Lua
 * array. Returns null when the field/value isn't a color_stops spec.
 */
function formatColorStops(raw: string): string | null {
  const pairs = String(raw)
    .split("|")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (pairs.length === 0) return null;
  const items: string[] = [];
  for (const p of pairs) {
    const sep = p.indexOf(":");
    if (sep === -1) return null; // malformed — leave the raw string alone
    const frac = Number(p.slice(0, sep).trim());
    const color = p.slice(sep + 1).trim();
    if (!Number.isFinite(frac) || color === "") return null;
    items.push(`{ ${frac}, ${luaStr(color)} }`);
  }
  return "{ " + items.join(", ") + " }";
}

function formatArray(raw: string, mode: "pipe" | "comma", numeric: boolean): string {
  const sep = mode === "pipe" ? "|" : ",";
  const parts = String(raw)
    .split(sep)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const items = parts.map((p) => (numeric ? String(Number(p)) : luaStr(p)));
  return "{ " + items.join(", ") + " }";
}

/** Build the `props = {...}` / `style = {...}` fragments for a control. */
function buildTable(
  control: DesignControl,
  def: WidgetDef,
  group: "props" | "style"
): string[] {
  const lines: string[] = [];
  const source = control[group];
  for (const fd of def.fields) {
    if (fd.group !== group) continue;
    const value = source[fd.key];
    if (value === undefined) continue;

    // Always drop empty-string values — nothing to write.
    if (typeof value === "string" && value.trim() === "") continue;

    // Props define what the control shows/does, so always emit them (even when
    // they equal the schema default, e.g. a button's default "Button" text).
    // Style fields are omitted when they equal their default to keep output
    // terse — the in-game renderer falls back to the same defaults. Props
    // flagged `optional` follow the same "skip default" rule so bounds/limits
    // don't clutter every element.
    if (group === "style" && value === fd.default) continue;
    if (group === "props" && fd.optional && value === fd.default) continue;

    // progress color_stops: nested { fraction, color } pairs.
    if (control.type === "progress" && fd.key === "color_stops" && typeof value === "string") {
      const stops = formatColorStops(value);
      // Fall back to a plain string if the spec is malformed so nothing is lost.
      lines.push(`${fd.key} = ${stops ?? luaStr(value)}`);
      continue;
    }

    // icon name: catalog picks emit the documented enum token
    // (ss.ui.icons.<kind>.<Name>); custom names emit icon_type="prefab" + name.
    if (control.type === "icon" && fd.key === "name" && typeof value === "string") {
      const parsed = parseIconValue(value);
      if (parsed) {
        // gas/slot/prefab-curated -> enum token; type is auto-detected in-game.
        lines.push(`name = ss.ui.icons.${parsed.kind}.${parsed.name}`);
      } else {
        // Raw custom prefab name (per docs: pass a prefab name string).
        lines.push(`icon_type = ${luaStr("prefab")}`);
        lines.push(`name = ${luaStr(value)}`);
      }
      continue;
    }

    const arr = isArrayField(control.type, fd.key);
    if (arr && typeof value === "string") {
      lines.push(`${fd.key} = ${formatArray(value, arr, arr === "comma")}`);
    } else {
      lines.push(`${fd.key} = ${formatScalar(fd, value)}`);
    }
  }
  return lines;
}

/** Argument list for a handler stub, matching the docs' callback signatures. */
function handlerArgs(control: DesignControl, ev: "click" | "change" | "toggle"): string {
  if (ev === "click") {
    return control.type === "table" || control.type === "interface_button"
      ? "value, playerName"
      : "playerName";
  }
  if (ev === "change") return "value, playerName";
  return "playerName"; // toggle
}

/**
 * Emit handler entries referencing the user-wired function name
 * (on_click = <name>). An empty handler name means the event is not wired.
 */
function buildHandlers(control: DesignControl): string[] {
  const out: string[] = [];
  (["click", "change", "toggle"] as const).forEach((ev) => {
    const name = control.handlers[ev];
    if (name && name.trim() !== "") {
      out.push(`on_${ev} = ${name.trim()}`);
    }
  });
  return out;
}

/** All (name, argList) handler stubs implied by a set of controls. */
export function collectHandlerStubs(
  controls: DesignControl[]
): { name: string; args: string }[] {
  const stubs: { name: string; args: string }[] = [];
  const seen = new Set<string>();
  for (const c of controls) {
    (["click", "change", "toggle"] as const).forEach((ev) => {
      const name = c.handlers[ev]?.trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        stubs.push({ name, args: handlerArgs(c, ev) });
      }
    });
  }
  return stubs;
}

/** Build the element definition table literal for one control. */
function elementLiteral(control: DesignControl, def: WidgetDef): string {
  const parts: string[] = [];
  parts.push(`id = ${luaStr(control.id)}`);
  parts.push(`type = ${luaStr(emittedType(control.type))}`);
  parts.push(
    `rect = { unit = "px", x = ${control.rect.x}, y = ${control.rect.y}, ` +
      `w = ${control.rect.w}, h = ${control.rect.h} }`
  );

  const props = buildTable(control, def, "props");
  if (control.z !== 0) props.push(`z_index = ${control.z}`);
  if (props.length > 0) {
    parts.push(`props = { ${props.join(", ")} }`);
  }
  const style = buildTable(control, def, "style");
  if (style.length > 0) {
    parts.push(`style = { ${style.join(", ")} }`);
  }
  parts.push(...buildHandlers(control));

  // Pretty-print each entry on its own indented line.
  return "{\n  " + parts.join(",\n  ") + ",\n}";
}

/** Emit the layout-option entries (direction/gap/padding/align/justify/cols/row_height). */
function layoutOptsEntries(layout: "flex" | "grid", opts: LayoutOpts): string[] {
  const out: string[] = [];
  out.push(`layout = ${luaStr(layout)}`);
  if (layout === "flex") {
    if (opts.direction) out.push(`direction = ${luaStr(opts.direction)}`);
    if (opts.align && opts.align !== "stretch") out.push(`align = ${luaStr(opts.align)}`);
    if (opts.justify && opts.justify !== "start") out.push(`justify = ${luaStr(opts.justify)}`);
  } else {
    out.push(`cols = ${Math.max(1, Math.round(Number(opts.cols ?? 2)))}`);
    if (opts.rowHeight != null && Number(opts.rowHeight) > 0)
      out.push(`row_height = ${Number(opts.rowHeight)}`);
  }
  if (opts.gap != null) out.push(`gap = ${Number(opts.gap)}`);
  if (opts.padding != null) {
    if (typeof opts.padding === "number") out.push(`padding = ${opts.padding}`);
    else {
      const p = opts.padding;
      const seg = (["top", "right", "bottom", "left"] as const)
        .filter((k) => p[k] != null)
        .map((k) => `${k} = ${Number(p[k])}`);
      if (seg.length > 0) out.push(`padding = { ${seg.join(", ")} }`);
    }
  }
  return out;
}

/**
 * Build a `ui:layout({...})` node literal for a layout container and its
 * descendants. Child nodes are nested inside `children = { ... }`: nested
 * layout containers recurse with their own `layout`/options; leaf/absolute
 * children carry `flex = N` (grow) or their fixed rect.
 *
 * `absRect` (when non-null) overrides the container's own rect with an absolute
 * position — used when a layout container is promoted to a top-level call from
 * inside an absolute parent.
 */
function layoutNodeLiteral(
  control: DesignControl,
  childrenOf: Map<string | null, DesignControl[]>,
  byId: Map<string, DesignControl>,
  absRect: { x: number; y: number; w: number; h: number } | null,
  indent = 0
): string {
  const pad = "  ".repeat(indent + 1);
  const closePad = "  ".repeat(indent);
  const def = WIDGET_BY_TYPE.get(control.type);
  const parts: string[] = [];

  parts.push(`id = ${luaStr(control.id)}`);
  parts.push(`type = ${luaStr(emittedType(control.type))}`);
  const r = absRect ?? control.rect;
  parts.push(`rect = { unit = "px", x = ${r.x}, y = ${r.y}, w = ${r.w}, h = ${r.h} }`);

  if (control.layout) {
    parts.push(...layoutOptsEntries(control.layout, control.layoutOpts ?? {}));
  }

  if (def) {
    const props = buildTable(control, def, "props");
    if (control.z !== 0) props.push(`z_index = ${control.z}`);
    if (props.length > 0) parts.push(`props = { ${props.join(", ")} }`);
    const style = buildTable(control, def, "style");
    if (style.length > 0) parts.push(`style = { ${style.join(", ")} }`);
  }
  parts.push(...buildHandlers(control));

  const kids = childrenOf.get(control.id) ?? [];
  if (kids.length > 0) {
    const childLiterals = kids.map((k) =>
      layoutChildLiteral(k, childrenOf, byId, indent + 2)
    );
    parts.push(
      `children = {\n${childLiterals.join(",\n")}\n${"  ".repeat(indent + 2)}}`
    );
  }

  return `{\n${pad}${parts.join(`,\n${pad}`)},\n${closePad}}`;
}

/** A child node inside a layout tree (leaf or nested container). */
function layoutChildLiteral(
  control: DesignControl,
  childrenOf: Map<string | null, DesignControl[]>,
  byId: Map<string, DesignControl>,
  indent: number
): string {
  // Nested layout container: recurse (keeps its own local rect within the tree).
  if (control.layout) {
    return "  ".repeat(indent) + layoutNodeLiteral(control, childrenOf, byId, null, indent);
  }

  const pad = "  ".repeat(indent + 1);
  const closePad = "  ".repeat(indent);
  const def = WIDGET_BY_TYPE.get(control.type);
  const parts: string[] = [];
  parts.push(`id = ${luaStr(control.id)}`);
  parts.push(`type = ${luaStr(emittedType(control.type))}`);

  // Flex-grow children use `flex = N`; fixed children keep a size rect.
  if (control.flexN && control.flexN > 0) {
    parts.push(`flex = ${control.flexN}`);
  } else {
    parts.push(`rect = { w = ${control.rect.w}, h = ${control.rect.h} }`);
  }

  if (def) {
    const props = buildTable(control, def, "props");
    if (control.z !== 0) props.push(`z_index = ${control.z}`);
    if (props.length > 0) parts.push(`props = { ${props.join(", ")} }`);
    const style = buildTable(control, def, "style");
    if (style.length > 0) parts.push(`style = { ${style.join(", ")} }`);
  }
  parts.push(...buildHandlers(control));

  return `${closePad}{\n${pad}${parts.join(`,\n${pad}`)},\n${closePad}}`;
}

/**
 * Generate the full Lua script. Controls are emitted parent-before-child so a
 * child can reference its parent's handle variable. Containers always get a
 * `local <id> = ...` binding; leaf controls only get one if they have children
 * (defensive) — otherwise they're emitted inline.
 */
export function generateLua(
  controls: DesignControl[],
  opts: GenOptions = {}
): string {
  const surface = opts.surface ?? "main";
  const byId = new Map(controls.map((c) => [c.id, c]));

  // Order: parents before children, then by z, then insertion order.
  const depth = (c: DesignControl): number => {
    let d = 0;
    let p = c.parentId ? byId.get(c.parentId) : undefined;
    const guard = new Set<string>();
    while (p && !guard.has(p.id)) {
      guard.add(p.id);
      d++;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return d;
  };
  const ordered = [...controls].sort((a, b) => {
    const da = depth(a);
    const db = depth(b);
    if (da !== db) return da - db;
    if (a.z !== b.z) return a.z - b.z;
    return a.order - b.order;
  });

  const lines: string[] = [];
  lines.push(`local ui = ss.ui.surface(${luaStr(surface)})`);
  lines.push(`ss.ui.activate(${luaStr(surface)})`);
  lines.push("ui:clear()");
  lines.push("");

  const childrenOf = new Map<string | null, DesignControl[]>();
  for (const c of ordered) {
    const key = c.parentId && byId.has(c.parentId) ? c.parentId : null;
    (childrenOf.get(key) ?? childrenOf.set(key, []).get(key)!).push(c);
  }

  // A "layout subtree" is a control with layout set whose parent is NOT itself
  // a layout container. It is emitted as a single documented `ui:layout({...})`
  // call (surface:layout) with an absolute-px rect; its descendants nest inside.
  // Everything else keeps the flat `:element` emission.
  const isLayoutSubtreeRoot = (c: DesignControl): boolean => {
    if (!c.layout) return false;
    const parent = c.parentId ? byId.get(c.parentId) : undefined;
    return !parent?.layout;
  };

  // Absolute px rect for a control (sum of ancestor px offsets), for promoting
  // a nested layout container to a top-level ui:layout call.
  const absRect = (c: DesignControl) => {
    let x = c.rect.x;
    let y = c.rect.y;
    let p = c.parentId ? byId.get(c.parentId) : undefined;
    const guard = new Set<string>();
    while (p && !guard.has(p.id)) {
      guard.add(p.id);
      x += p.rect.x;
      y += p.rect.y;
      p = p.parentId ? byId.get(p.parentId) : undefined;
    }
    return { x, y, w: c.rect.w, h: c.rect.h };
  };

  // Emit a flat `:element` control and (recursively) its non-layout children.
  const emitFlat = (c: DesignControl, receiver: string) => {
    const def = WIDGET_BY_TYPE.get(c.type);
    if (!def) return;
    const kids = childrenOf.get(c.id) ?? [];
    const literal = elementLiteral(c, def);
    if (kids.length > 0) {
      lines.push(`local ${luaVar(c.id)} = ${receiver}:element(${literal})`);
    } else {
      lines.push(`${receiver}:element(${literal})`);
    }
    lines.push("");
    for (const k of kids) {
      if (isLayoutSubtreeRoot(k)) emitLayout(k, true);
      else emitFlat(k, luaVar(c.id));
    }
  };

  // Emit a layout container as ui:layout({...}) with nested children.
  const emitLayout = (c: DesignControl, absolutePosition: boolean) => {
    const literal = layoutNodeLiteral(c, childrenOf, byId, absolutePosition ? absRect(c) : null);
    lines.push(`ui:layout(${literal})`);
    lines.push("");
  };

  for (const c of childrenOf.get(null) ?? []) {
    if (isLayoutSubtreeRoot(c)) emitLayout(c, false);
    else emitFlat(c, "ui");
  }

  lines.push("ui:commit()");
  return lines.join("\n");
}

// ---- Designer block merge (WinForms-style designer + code-behind) ----

export const DESIGNER_BEGIN = "-- <designer> auto-generated, edited via the Design tab";
export const DESIGNER_END = "-- </designer>";

const HANDLERS_BEGIN = "-- <designer-handlers> stubs added once; edit freely";
const HANDLERS_END = "-- </designer-handlers>";

/** The default full script for an empty designer (no controls yet). */
function emptyDesignerScript(): string {
  return (
    DESIGNER_BEGIN +
    "\n" +
    generateLua([]) +
    "\n" +
    DESIGNER_END +
    "\n"
  );
}

/**
 * Merge the designer's controls into an existing script, WinForms-style:
 *  - Replace only the content between DESIGNER_BEGIN/END (layout), preserving
 *    all user code before and after that region.
 *  - Ensure each handler referenced by the layout has an empty function stub in
 *    a dedicated handlers region; add missing ones without touching existing
 *    implementations.
 * If the script has no designer region yet, one is inserted at the top.
 */
export function mergeDesignerScript(
  existingScript: string,
  controls: DesignControl[]
): string {
  const block = generateLua(controls);
  const region = `${DESIGNER_BEGIN}\n${block}\n${DESIGNER_END}`;

  let script = existingScript;

  // 1) Replace or insert the layout region.
  const beginIdx = script.indexOf(DESIGNER_BEGIN);
  const endIdx = script.indexOf(DESIGNER_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    const before = script.slice(0, beginIdx);
    const after = script.slice(endIdx + DESIGNER_END.length);
    script = before + region + after;
  } else {
    // No region yet: put it at the very top, keep any existing code below.
    script = region + (script.trim() ? "\n\n" + script : "\n");
  }

  // 2) Ensure handler stubs exist for every referenced handler.
  script = ensureHandlerStubs(script, controls);

  return script;
}

/**
 * Add empty function definitions for any handler the layout references that is
 * not already defined anywhere in the script. Stubs live in a dedicated region
 * appended once; existing implementations are never overwritten.
 */
function ensureHandlerStubs(script: string, controls: DesignControl[]): string {
  const stubs = collectHandlerStubs(controls);
  if (stubs.length === 0) return script;

  const missing = stubs.filter((s) => !isFunctionDefined(script, s.name));
  if (missing.length === 0) return script;

  const stubText = missing
    .map(
      (s) =>
        `function ${s.name}(${s.args})\n  -- TODO: implement ${s.name}\nend`
    )
    .join("\n\n");

  const hBegin = script.indexOf(HANDLERS_BEGIN);
  const hEnd = script.indexOf(HANDLERS_END);
  if (hBegin !== -1 && hEnd !== -1 && hEnd > hBegin) {
    // Insert new stubs just before the end marker.
    const before = script.slice(0, hEnd).replace(/\s*$/, "\n\n");
    const after = script.slice(hEnd);
    return before + stubText + "\n\n" + after;
  }

  // No handlers region yet: create one at the end.
  return (
    script.replace(/\s*$/, "") +
    "\n\n" +
    HANDLERS_BEGIN +
    "\n\n" +
    stubText +
    "\n\n" +
    HANDLERS_END +
    "\n"
  );
}

/** True if a `function name(...)` (or `name = function`) definition exists. */
function isFunctionDefined(script: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`function\\s+${esc}\\s*\\(`),
    new RegExp(`(local\\s+)?${esc}\\s*=\\s*function`),
  ];
  return patterns.some((re) => re.test(script));
}

/**
 * Find the 1-based line to place the cursor for a handler function's body.
 * Matches `function <name>(` or `<name> = function` and returns the line
 * *inside* the body (the line after the signature) when present, otherwise the
 * signature line. Returns null when the function isn't found.
 */
export function findFunctionBodyLine(script: string, name: string): number | null {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sigRe = new RegExp(
    `(?:function\\s+${esc}\\s*\\(|(?:local\\s+)?${esc}\\s*=\\s*function\\b)`
  );
  const lines = script.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (sigRe.test(lines[i])) {
      // Prefer the first body line; fall back to the signature line if the
      // function is the last line (no body line yet).
      return i + 1 < lines.length ? i + 2 : i + 1;
    }
  }
  return null;
}

/** Build a full standalone script (used by Save .lua) for the given controls. */
export function fullScript(existingScript: string, controls: DesignControl[]): string {
  return mergeDesignerScript(existingScript || emptyDesignerScript(), controls);
}

/** A safe Lua local variable name derived from a control id. */
function luaVar(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(safe) ? safe : "_" + safe;
}
