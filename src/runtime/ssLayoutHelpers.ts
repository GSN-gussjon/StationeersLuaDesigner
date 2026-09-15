// Layout helpers `ss.ui.flex(opts, children)` and `ss.ui.grid(opts, children)`.
// These are NOT element types — they compute rects for an array of child
// definitions and return that array (with rect applied), which the script then
// passes to ui:element. Signatures follow ScriptedScreens docs (api/flex.md,
// api/grid.md).

type Json = Record<string, unknown>;

function num(v: unknown, dflt = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : dflt;
}

function asRecord(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  // Lua arrays arrive as objects with 1-based numeric keys.
  const rec = asRecord(v);
  return rec ? Object.values(rec) : [];
}

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Resolve the documented padding shorthands into per-side insets. */
function resolvePadding(p: unknown): Insets {
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  const rec = asRecord(p);
  if (!rec) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (rec.vertical !== undefined || rec.horizontal !== undefined) {
    const v = num(rec.vertical);
    const h = num(rec.horizontal);
    return { top: v, bottom: v, left: h, right: h };
  }
  return {
    top: num(rec.top),
    right: num(rec.right),
    bottom: num(rec.bottom),
    left: num(rec.left),
  };
}

function containerRect(opts: Json): { x: number; y: number; w: number; h: number } {
  const r = asRecord(opts.rect) ?? {};
  return { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) };
}

/** flex layout: distribute children along a row or column. */
export function flex(opts: unknown, children: unknown): unknown[] {
  const o = asRecord(opts) ?? {};
  const kids = asArray(children).map((c) => asRecord(c)).filter(Boolean) as Json[];
  const box = containerRect(o);
  const pad = resolvePadding(o.padding);
  const gap = num(o.gap, 4);
  const dir = String(o.direction ?? "row");
  const isRow = dir !== "column";
  const align = String(o.align ?? "stretch");
  const justify = String(o.justify ?? "start");

  const innerX = box.x + pad.left;
  const innerY = box.y + pad.top;
  const innerW = box.w - pad.left - pad.right;
  const innerH = box.h - pad.top - pad.bottom;

  const mainSize = isRow ? innerW : innerH;
  const crossSize = isRow ? innerH : innerW;

  // Determine fixed sizes and total flex weight.
  const fixedFor = (k: Json): number | null => {
    const flexN = k.flex !== undefined ? num(k.flex) : null;
    if (flexN !== null && flexN > 0) return null; // flexible
    const r = asRecord(k.rect);
    const s = isRow ? num(r?.w, NaN) : num(r?.h, NaN);
    return Number.isFinite(s) ? s : 40; // docs: neither -> 40px fixed
  };

  const totalGaps = kids.length > 0 ? gap * (kids.length - 1) : 0;
  let usedFixed = 0;
  let totalFlex = 0;
  for (const k of kids) {
    const f = fixedFor(k);
    if (f === null) totalFlex += num(k.flex, 1);
    else usedFixed += f;
  }
  const freeSpace = Math.max(0, mainSize - usedFixed - totalGaps);

  // Compute main-axis sizes.
  const sizes = kids.map((k) => {
    const f = fixedFor(k);
    return f === null ? (num(k.flex, 1) / (totalFlex || 1)) * freeSpace : f;
  });

  // Justify offset (only meaningful when there's leftover space & no flex).
  const contentMain = sizes.reduce((a, b) => a + b, 0) + totalGaps;
  let startOffset = 0;
  let betweenGap = gap;
  if (totalFlex === 0) {
    const leftover = mainSize - contentMain;
    if (justify === "center") startOffset = leftover / 2;
    else if (justify === "end") startOffset = leftover;
    else if (justify === "between" && kids.length > 1)
      betweenGap = gap + leftover / (kids.length - 1);
    else if (justify === "evenly") {
      const slot = leftover / (kids.length + 1);
      startOffset = slot;
      betweenGap = gap + slot;
    }
  }

  let cursor = (isRow ? innerX : innerY) + startOffset;
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    const size = sizes[i];
    // Cross-axis size/pos from align.
    const kr = asRecord(k.rect) ?? {};
    const fixedCross = isRow ? num(kr.h, NaN) : num(kr.w, NaN);
    let crossPos = isRow ? innerY : innerX;
    let cross = crossSize;
    if (align !== "stretch" && Number.isFinite(fixedCross)) {
      cross = fixedCross;
      if (align === "center") crossPos += (crossSize - cross) / 2;
      else if (align === "end") crossPos += crossSize - cross;
    } else if (align === "center" || align === "end") {
      // No fixed cross size but non-stretch: keep full unless a size is given.
      cross = Number.isFinite(fixedCross) ? fixedCross : crossSize;
    }

    k.rect = isRow
      ? { unit: "px", x: cursor, y: crossPos, w: size, h: cross }
      : { unit: "px", x: crossPos, y: cursor, w: cross, h: size };
    cursor += size + betweenGap;
  }

  return kids;
}

/** grid layout: fixed columns, wrapping rows. */
export function grid(opts: unknown, children: unknown): unknown[] {
  const o = asRecord(opts) ?? {};
  const kids = asArray(children).map((c) => asRecord(c)).filter(Boolean) as Json[];
  const box = containerRect(o);
  const pad = resolvePadding(o.padding);
  const gap = num(o.gap, 4);
  const cols = Math.max(1, Math.trunc(num(o.cols, 2)));

  const innerX = box.x + pad.left;
  const innerY = box.y + pad.top;
  const innerW = box.w - pad.left - pad.right;
  const cellW = (innerW - gap * (cols - 1)) / cols;
  const rowH = o.row_height !== undefined ? num(o.row_height) : cellW; // square if omitted

  kids.forEach((k, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    k.rect = {
      unit: "px",
      x: innerX + col * (cellW + gap),
      y: innerY + row * (rowH + gap),
      w: cellW,
      h: rowH,
    };
  });

  return kids;
}
