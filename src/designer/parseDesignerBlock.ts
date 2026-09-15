// Parse the designer block of a script back into DesignControl[] (Script ->
// Design direction). This only understands the format the generator produces
// (ui:element / <var>:element with id/type/rect/props/style/on_* handler refs),
// which is the WinForms-style contract: the region is machine-owned. If the
// block is missing or cannot be parsed, returns null and the designer is left
// unchanged.

import type { LayoutOpts, Rect } from "../runtime/ssScene";
import type { DesignControl, HandlerMap } from "./designerModel";
import { DESIGNER_BEGIN, DESIGNER_END, isArrayField } from "./generateLua";
import { WIDGET_BY_TYPE } from "./widgetSchema";

/** Extract the text between the designer markers, or null if absent. */
export function extractDesignerBlock(script: string): string | null {
  const b = script.indexOf(DESIGNER_BEGIN);
  const e = script.indexOf(DESIGNER_END);
  if (b === -1 || e === -1 || e <= b) return null;
  return script.slice(b + DESIGNER_BEGIN.length, e);
}

// ---- Minimal Lua-value parser (numbers, strings, booleans, tables) ----
// Sufficient for the generated element literals; not a general Lua parser.

interface Cursor {
  s: string;
  i: number;
}

function skipWs(c: Cursor) {
  while (c.i < c.s.length) {
    const ch = c.s[c.i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") c.i++;
    else break;
  }
}

function parseValue(c: Cursor): unknown {
  skipWs(c);
  const ch = c.s[c.i];
  if (ch === "{") return parseTable(c);
  if (ch === '"' || ch === "'") return parseString(c);
  // number or boolean or bareword (enum ref like ic.enums...).
  const rest = c.s.slice(c.i);
  const boolM = /^(true|false)\b/.exec(rest);
  if (boolM) {
    c.i += boolM[0].length;
    return boolM[1] === "true";
  }
  const numM = /^-?\d+(\.\d+)?/.exec(rest);
  if (numM && /[\d-]/.test(ch)) {
    c.i += numM[0].length;
    return Number(numM[0]);
  }
  // Bareword / dotted identifier (e.g. enum reference or handler name) — capture
  // as a raw token string so callers can decide what to do with it.
  const idM = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest);
  if (idM) {
    c.i += idM[0].length;
    return { __raw: idM[0] };
  }
  throw new Error(`Unexpected token at ${c.i}: ${rest.slice(0, 12)}`);
}

function parseString(c: Cursor): string {
  const quote = c.s[c.i];
  c.i++;
  let out = "";
  while (c.i < c.s.length) {
    const ch = c.s[c.i++];
    if (ch === "\\") {
      const next = c.s[c.i++];
      out += next === "n" ? "\n" : next;
    } else if (ch === quote) {
      break;
    } else {
      out += ch;
    }
  }
  return out;
}

function parseTable(c: Cursor): Record<string, unknown> | unknown[] {
  c.i++; // consume {
  const obj: Record<string, unknown> = {};
  const arr: unknown[] = [];
  let isArray = true;
  for (;;) {
    skipWs(c);
    if (c.s[c.i] === "}") {
      c.i++;
      break;
    }
    // Try key = value.
    const save = c.i;
    const keyM = /^[A-Za-z_][A-Za-z0-9_]*/.exec(c.s.slice(c.i));
    let key: string | null = null;
    if (keyM) {
      const after = c.i + keyM[0].length;
      const j = skipEq(c.s, after);
      if (j !== -1) {
        key = keyM[0];
        c.i = j;
      }
    }
    if (key === null) {
      // Positional array element.
      const v = parseValue(c);
      arr.push(v);
    } else {
      isArray = false;
      obj[key] = parseValue(c);
    }
    skipWs(c);
    if (c.s[c.i] === ",") c.i++;
    else if (c.s[c.i] === "}") {
      c.i++;
      break;
    }
    // Guard against infinite loop on malformed input.
    if (c.i === save && c.s[c.i] !== "}") {
      throw new Error("Parser stuck");
    }
  }
  return isArray && arr.length > 0 ? arr : obj;
}

/** If s[from..] is optional-ws then "=", return index after "="; else -1. */
function skipEq(s: string, from: number): number {
  let i = from;
  while (i < s.length && (s[i] === " " || s[i] === "\t")) i++;
  if (s[i] === "=" && s[i + 1] !== "=") return i + 1;
  return -1;
}

/** Parse one `{...}` table literal starting at the given index. */
function parseTableAt(s: string, at: number): { value: Record<string, unknown>; end: number } {
  const c: Cursor = { s, i: at };
  const value = parseTable(c) as Record<string, unknown>;
  return { value, end: c.i };
}

function num(v: unknown, dflt = 0): number {
  return typeof v === "number" ? v : dflt;
}

/**
 * Parse the designer block into controls. Returns null if the block is absent
 * or any element literal fails to parse (caller keeps the current controls).
 */
export function parseDesignerBlock(script: string): DesignControl[] | null {
  const block = extractDesignerBlock(script);
  if (block === null) return null;

  // Map Lua local variable name -> control id (for nesting via receiver var).
  const varToId = new Map<string, string>();
  const controls: DesignControl[] = [];
  const orderRef = { n: 0 };

  // Match both "<receiver>:element(" and "ui:layout(" (with optional
  // "local <var> = " prefix on element calls that bind a container handle).
  const callRe =
    /(?:local\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(element|layout)\s*\(/g;
  let m: RegExpExecArray | null;
  try {
    while ((m = callRe.exec(block)) !== null) {
      const localVar = m[1] ?? null;
      const receiver = m[2];
      const call = m[3];
      const braceIdx = block.indexOf("{", callRe.lastIndex - 1);
      if (braceIdx === -1) return null;
      const { value: tbl, end } = parseTableAt(block, braceIdx);
      callRe.lastIndex = end;

      if (call === "layout") {
        // Recurse the layout tree; the top node's parent is the surface root.
        if (!buildLayoutNode(tbl, null, controls, orderRef)) return null;
        continue;
      }

      // Flat element call.
      const parentId =
        receiver !== "ui" && varToId.has(receiver) ? varToId.get(receiver)! : null;
      const control = tableToControl(tbl, parentId, orderRef, false);
      if (!control) return null;
      if (localVar) varToId.set(localVar, control.id);
      controls.push(control);
    }
  } catch {
    // Malformed generated block — don't clobber the designer.
    return null;
  }

  return controls;
}

/**
 * Recursively convert a parsed `ui:layout` node table into controls, appending
 * them (parent-before-child) to `out`. `parentId` is the enclosing container's
 * id (null at the surface root). Returns false on malformed input.
 */
function buildLayoutNode(
  tbl: Record<string, unknown>,
  parentId: string | null,
  out: DesignControl[],
  orderRef: { n: number }
): boolean {
  const control = tableToControl(tbl, parentId, orderRef, true);
  if (!control) return false;
  out.push(control);

  const children = tbl.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === "object") {
        if (!buildLayoutNode(child as Record<string, unknown>, control.id, out, orderRef))
          return false;
      }
    }
  }
  return true;
}

/**
 * Convert one parsed element/layout table into a DesignControl. `fromLayout`
 * distinguishes tree nodes (which may carry `layout`/`flex`/`children`) from
 * flat `:element` calls.
 */
function tableToControl(
  tbl: Record<string, unknown>,
  parentId: string | null,
  orderRef: { n: number },
  fromLayout: boolean
): DesignControl | null {
  const id = typeof tbl.id === "string" ? tbl.id : null;
  const luaType = typeof tbl.type === "string" ? tbl.type : null;
  if (!id || !luaType) return null;

  // A panel with a `layout` field is one of the designer's layout containers;
  // map it back to the flex/grid designer type.
  const layoutMode =
    typeof tbl.layout === "string" && (tbl.layout === "flex" || tbl.layout === "grid")
      ? (tbl.layout as "flex" | "grid")
      : undefined;
  const type = layoutMode ?? luaType;
  if (!WIDGET_BY_TYPE.has(type)) return null;

  const rectRaw = (tbl.rect ?? {}) as Record<string, unknown>;
  const rect: Rect = {
    unit: "px",
    x: num(rectRaw.x),
    y: num(rectRaw.y),
    w: num(rectRaw.w, 10),
    h: num(rectRaw.h, 10),
  };

  const props = { ...((tbl.props as Record<string, unknown>) ?? {}) };
  const style = { ...((tbl.style as Record<string, unknown>) ?? {}) };

  // z_index lives on props; pull it out into the control.z field.
  let z = 0;
  if (typeof props.z_index === "number") {
    z = props.z_index;
    delete props.z_index;
  }
  normalizeRawTokens(props);
  normalizeRawTokens(style);

  // Array-valued props -> delimiter text (see generator's isArrayField).
  for (const key of Object.keys(props)) {
    const delim = isArrayField(type, key);
    if (delim && Array.isArray(props[key])) {
      const sep = delim === "comma" ? "," : "|";
      props[key] = (props[key] as unknown[]).map((v) => String(v)).join(sep);
    }
  }

  // progress color_stops (style) -> "frac:color|frac:color" text.
  if (type === "progress" && Array.isArray(style.color_stops)) {
    style.color_stops = (style.color_stops as unknown[])
      .map((pair) => (Array.isArray(pair) ? `${pair[0]}:${pair[1]}` : String(pair)))
      .join("|");
  }

  // icon name: the enum token ss.ui.icons.<kind>.<Name> (parsed as a raw string
  // after normalizeRawTokens) -> "<kind>:<Name>" for the picker. A plain string
  // with icon_type="prefab" is a custom prefab -> keep the raw name.
  if (type === "icon") {
    const rawName = typeof props.name === "string" ? props.name : "";
    const enumM = /^ss\.ui\.icons\.(gas|slot|prefab)\.([A-Za-z0-9_]+)$/.exec(rawName);
    if (enumM) {
      props.name = `${enumM[1]}:${enumM[2]}`;
    }
    // icon_type is not a designer field anymore; drop it (the name carries it).
    delete props.icon_type;
  }

  const handlers: HandlerMap = {
    click: handlerRef(tbl.on_click),
    change: handlerRef(tbl.on_change),
    toggle: handlerRef(tbl.on_toggle),
  };

  const control: DesignControl = {
    id,
    type,
    rect,
    props,
    style,
    parentId,
    z,
    order: orderRef.n++,
    handlers,
  };

  if (fromLayout) {
    // Layout container: read its options. Leaf child: read `flex`.
    if (layoutMode) {
      control.layout = layoutMode;
      control.layoutOpts = readLayoutOpts(tbl);
    }
    const flex = num(tbl.flex, 0);
    if (flex > 0) control.flexN = flex;
  }

  return control;
}

/** Read layout options (direction/gap/padding/align/justify/cols/row_height). */
function readLayoutOpts(tbl: Record<string, unknown>): LayoutOpts {
  const opts: LayoutOpts = {};
  const dir = tbl.direction;
  if (dir === "row" || dir === "column") opts.direction = dir;
  const align = tbl.align;
  if (align === "stretch" || align === "start" || align === "center" || align === "end")
    opts.align = align;
  const justify = tbl.justify;
  if (
    justify === "start" ||
    justify === "center" ||
    justify === "end" ||
    justify === "between" ||
    justify === "evenly"
  )
    opts.justify = justify;
  if (tbl.gap != null) opts.gap = num(tbl.gap);
  if (tbl.cols != null) opts.cols = num(tbl.cols);
  if (tbl.row_height != null) opts.rowHeight = num(tbl.row_height);
  if (tbl.padding != null) {
    if (typeof tbl.padding === "number") opts.padding = tbl.padding;
    else if (typeof tbl.padding === "object") {
      const p = tbl.padding as Record<string, unknown>;
      opts.padding = {
        top: p.top != null ? num(p.top) : undefined,
        right: p.right != null ? num(p.right) : undefined,
        bottom: p.bottom != null ? num(p.bottom) : undefined,
        left: p.left != null ? num(p.left) : undefined,
      };
    }
  }
  return opts;
}

/**
 * Extract a handler function name from a parsed on_<ev> value. The generator
 * emits a bareword (parsed as {__raw:name}); anything else means not wired.
 */
function handlerRef(v: unknown): string {
  if (v && typeof v === "object" && "__raw" in (v as Record<string, unknown>)) {
    return String((v as { __raw: string }).__raw);
  }
  return "";
}

/** Replace {__raw:"..."} tokens (enum refs) with their raw string form. */
function normalizeRawTokens(obj: Record<string, unknown>) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object" && "__raw" in (v as Record<string, unknown>)) {
      obj[k] = (v as { __raw: string }).__raw;
    }
  }
}
