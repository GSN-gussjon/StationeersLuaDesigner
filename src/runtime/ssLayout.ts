// Layout resolution for the ScriptedScreens scene: turns the flat element list
// (with parentId + rect units) into absolute pixel rectangles, sorted in draw
// order. Shared by the canvas renderer and hit-testing.

import type {
  LayoutOpts,
  LayoutPadding,
  SceneElement,
  SceneSnapshot,
} from "./ssScene";

export interface LaidOutElement {
  el: SceneElement;
  /** Absolute pixel rect on the screen surface. */
  ax: number;
  ay: number;
  aw: number;
  ah: number;
}

/** Resolve padding (uniform number or per-side) into four insets. */
function resolvePadding(p: LayoutPadding | undefined): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  if (p == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof p === "number") return { top: p, right: p, bottom: p, left: p };
  return {
    top: num(p.top),
    right: num(p.right),
    bottom: num(p.bottom),
    left: num(p.left),
  };
}

/**
 * Compute absolute child rects for a flex container, mirroring the documented
 * ss.ui.flex algorithm: children with `flexN > 0` grow proportionally to fill
 * the main axis; others use their fixed rect size (default 40px). `gap`,
 * `padding`, cross-axis `align`, and main-axis `justify` are honored.
 */
function computeFlex(
  parent: LaidOutElement,
  children: SceneElement[],
  opts: LayoutOpts
): Map<string, { ax: number; ay: number; aw: number; ah: number }> {
  const pad = resolvePadding(opts.padding);
  const gap = num(opts.gap, 4);
  const row = (opts.direction ?? "row") === "row";
  const align = opts.align ?? "stretch";
  const justify = opts.justify ?? "start";

  const innerX = parent.ax + pad.left;
  const innerY = parent.ay + pad.top;
  const innerW = Math.max(0, parent.aw - pad.left - pad.right);
  const innerH = Math.max(0, parent.ah - pad.top - pad.bottom);

  const mainSize = row ? innerW : innerH;
  const crossSize = row ? innerH : innerW;

  const fixedMain = (el: SceneElement): number => {
    const v = row ? num(el.rect.w, 40) : num(el.rect.h, 40);
    return v > 0 ? v : 40;
  };
  const flexOf = (el: SceneElement): number =>
    el.flexN && el.flexN > 0 ? el.flexN : 0;

  const totalGap = children.length > 0 ? gap * (children.length - 1) : 0;
  let usedFixed = 0;
  let totalFlex = 0;
  for (const el of children) {
    if (flexOf(el) > 0) totalFlex += flexOf(el);
    else usedFixed += fixedMain(el);
  }
  const freeSpace = Math.max(0, mainSize - totalGap - usedFixed);

  // Main-axis sizes per child.
  const mainSizes = children.map((el) => {
    const fl = flexOf(el);
    return fl > 0 && totalFlex > 0 ? (freeSpace * fl) / totalFlex : fixedMain(el);
  });
  const contentMain =
    mainSizes.reduce((a, b) => a + b, 0) + totalGap;

  // justify: leading offset + inter-child spacing (only when no flex children).
  let lead = 0;
  let between = gap;
  const slack = Math.max(0, mainSize - contentMain);
  if (totalFlex === 0 && children.length > 0) {
    if (justify === "center") lead = slack / 2;
    else if (justify === "end") lead = slack;
    else if (justify === "between" && children.length > 1)
      between = gap + slack / (children.length - 1);
    else if (justify === "evenly") {
      const unit = slack / (children.length + 1);
      lead = unit;
      between = gap + unit;
    }
  }

  const out = new Map<string, { ax: number; ay: number; aw: number; ah: number }>();
  let cursor = (row ? innerX : innerY) + lead;
  children.forEach((el, i) => {
    const ms = mainSizes[i];
    // Cross-axis size: stretch fills, else use fixed cross rect (default 40).
    const fixedCross = row ? num(el.rect.h, 40) : num(el.rect.w, 40);
    const cs =
      align === "stretch" ? crossSize : fixedCross > 0 ? fixedCross : 40;
    let crossPos = row ? innerY : innerX;
    if (align === "center") crossPos += (crossSize - cs) / 2;
    else if (align === "end") crossPos += crossSize - cs;

    const r = row
      ? { ax: cursor, ay: crossPos, aw: ms, ah: cs }
      : { ax: crossPos, ay: cursor, aw: cs, ah: ms };
    out.set(el.id, r);
    cursor += ms + between;
  });
  return out;
}

/**
 * Compute absolute child rects for a fixed-column grid, mirroring ss.ui.grid:
 * `cols` columns, `gap` between cells, `padding` inset, and a fixed
 * `rowHeight` (square cells when omitted). Children fill left-to-right,
 * top-to-bottom in insertion order.
 */
function computeGrid(
  parent: LaidOutElement,
  children: SceneElement[],
  opts: LayoutOpts
): Map<string, { ax: number; ay: number; aw: number; ah: number }> {
  const pad = resolvePadding(opts.padding);
  const gap = num(opts.gap, 4);
  const cols = Math.max(1, Math.round(num(opts.cols, 2)));

  const innerX = parent.ax + pad.left;
  const innerY = parent.ay + pad.top;
  const innerW = Math.max(0, parent.aw - pad.left - pad.right);

  const cellW = (innerW - gap * (cols - 1)) / cols;
  const cellH = opts.rowHeight != null ? num(opts.rowHeight) : cellW;

  const out = new Map<string, { ax: number; ay: number; aw: number; ah: number }>();
  children.forEach((el, i) => {
    const col = i % cols;
    const rowIdx = Math.floor(i / cols);
    out.set(el.id, {
      ax: innerX + col * (cellW + gap),
      ay: innerY + rowIdx * (cellH + gap),
      aw: cellW,
      ah: cellH,
    });
  });
  return out;
}

function num(v: unknown, dflt = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : dflt;
}

/**
 * Resolve one element's absolute rect given its parent's absolute rect and the
 * surface size. Percentage units are relative to the parent's size (or the
 * surface if it has no parent).
 */
function resolveRect(
  el: SceneElement,
  parent: LaidOutElement | null,
  surfaceW: number,
  surfaceH: number
): { ax: number; ay: number; aw: number; ah: number } {
  const baseX = parent ? parent.ax : 0;
  const baseY = parent ? parent.ay : 0;
  const baseW = parent ? parent.aw : surfaceW;
  const baseH = parent ? parent.ah : surfaceH;

  const isPct = el.rect.unit === "%" || el.rect.unit === "percent";
  if (isPct) {
    return {
      ax: baseX + (num(el.rect.x) / 100) * baseW,
      ay: baseY + (num(el.rect.y) / 100) * baseH,
      aw: (num(el.rect.w) / 100) * baseW,
      ah: (num(el.rect.h) / 100) * baseH,
    };
  }
  return {
    ax: baseX + num(el.rect.x),
    ay: baseY + num(el.rect.y),
    aw: num(el.rect.w),
    ah: num(el.rect.h),
  };
}

/**
 * Produce a draw-ordered, absolutely-positioned list of elements.
 * Draw order: a parent draws before its children; siblings are ordered by
 * z (ascending) then insertion order — matching the documented "larger z in
 * front, ties by sibling order" rule, per parent.
 */
export function layoutScene(scene: SceneSnapshot): LaidOutElement[] {
  const byId = new Map<string, SceneElement>();
  for (const el of scene.elements) byId.set(el.id, el);

  // Group children by parent for sibling ordering.
  const childrenOf = new Map<string | null, SceneElement[]>();
  for (const el of scene.elements) {
    const key = el.parentId && byId.has(el.parentId) ? el.parentId : null;
    const list = childrenOf.get(key) ?? [];
    list.push(el);
    childrenOf.set(key, list);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.z - b.z || a.order - b.order);
  }

  const out: LaidOutElement[] = [];
  const laidById = new Map<string, LaidOutElement>();

  const walk = (parentKey: string | null, parent: LaidOutElement | null) => {
    const list = childrenOf.get(parentKey) ?? [];

    // When the parent is an auto-layout container, its children's rects are
    // computed by the flex/grid pass rather than taken from their own rect.
    let computed:
      | Map<string, { ax: number; ay: number; aw: number; ah: number }>
      | null = null;
    if (parent && parent.el.layout) {
      const opts = parent.el.layoutOpts ?? {};
      computed =
        parent.el.layout === "grid"
          ? computeGrid(parent, list, opts)
          : computeFlex(parent, list, opts);
    }

    for (const el of list) {
      const r =
        computed?.get(el.id) ??
        resolveRect(el, parent, scene.width, scene.height);
      const laid: LaidOutElement = { el, ...r };
      out.push(laid);
      laidById.set(el.id, laid);
      walk(el.id, laid);
    }
  };
  walk(null, null);

  return out;
}

/**
 * Hit-test in reverse draw order (topmost first). Returns the first element
 * whose absolute rect contains the point and that has the requested capability.
 */
export function hitTest(
  laidOut: LaidOutElement[],
  x: number,
  y: number,
  predicate: (el: SceneElement) => boolean
): LaidOutElement | null {
  for (let i = laidOut.length - 1; i >= 0; i--) {
    const l = laidOut[i];
    if (!predicate(l.el)) continue;
    if (x >= l.ax && x <= l.ax + l.aw && y >= l.ay && y <= l.ay + l.ah) {
      return l;
    }
  }
  return null;
}
