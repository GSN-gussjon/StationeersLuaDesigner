// Design canvas: renders the controls with the runtime renderer, and layers a
// DOM overlay for selection + resize handles. Supports drop-from-toolbox,
// drag-to-move (with reparenting into containers), 8-handle resize, click to
// select, Delete to remove, and snap-to-grid.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { drawElement } from "../runtime/ssDraw";
import { layoutScene, type LaidOutElement } from "../runtime/ssLayout";
import { useDesigner } from "./designerStore";
import { absoluteRect, controlsToScene } from "./designerModel";
import { WIDGET_BY_TYPE } from "./widgetSchema";
import { WIDGET_DND_TYPE } from "./Toolbox";

type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
const HANDLES: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

interface DragState {
  mode: "move" | "resize";
  id: string;
  handle?: HandleDir;
  // Pointer position at gesture start, in board coordinates.
  startX: number;
  startY: number;
  // Original rect (control-local) at gesture start.
  origRect: { x: number; y: number; w: number; h: number };
  // Original parent offset (absolute - local) so we can keep coords consistent.
  parentOffX: number;
  parentOffY: number;
}

export function DesignCanvas() {
  const { state, dispatch } = useDesigner();
  const { controls, selectedId, board, grid } = state;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const laidOutRef = useRef<LaidOutElement[]>([]);
  const dragRef = useRef<DragState | null>(null);
  const [, forceRerender] = useState(0);

  const byId = new Map(controls.map((c) => [c.id, c]));

  // A control whose parent is an auto-layout (flex/grid) container has its rect
  // computed by the layout engine — free move/resize is disabled for it.
  const isLayoutManaged = (id: string): boolean => {
    const c = byId.get(id);
    if (!c || !c.parentId) return false;
    return Boolean(byId.get(c.parentId)?.layout);
  };

  // Absolute rect from the laid-out list (reflects computed layout positions),
  // falling back to the model's absoluteRect before the first draw.
  const laidRectOf = (id: string): { x: number; y: number; w: number; h: number } | null => {
    const l = laidOutRef.current.find((e) => e.el.id === id);
    if (l) return { x: l.ax, y: l.ay, w: l.aw, h: l.ah };
    const c = byId.get(id);
    return c ? absoluteRect(c, byId) : null;
  };

  // ---- Rendering the controls to the canvas ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, board.w, board.h);
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, board.w, board.h);

    // Grid.
    if (grid.enabled && grid.size > 1) {
      ctx.strokeStyle = "rgba(148,163,184,0.10)";
      ctx.lineWidth = 1;
      for (let x = grid.size; x < board.w; x += grid.size) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, board.h);
        ctx.stroke();
      }
      for (let y = grid.size; y < board.h; y += grid.size) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(board.w, y + 0.5);
        ctx.stroke();
      }
    }

    const scene = controlsToScene(controls, board);
    const laid = layoutScene(scene);
    laidOutRef.current = laid;
    const now = performance.now();
    for (const l of laid) drawElement(ctx, l, now);
  }, [controls, board, grid]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  // ---- Coordinate mapping (canvas is CSS-scaled) ----
  const toBoard = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const sx = board.w / r.width;
    const sy = board.h / r.height;
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  };

  const snap = (v: number) =>
    grid.enabled && grid.size > 1 ? Math.round(v / grid.size) * grid.size : Math.round(v);

  // Topmost control at a board point (reverse draw order).
  const controlAt = (x: number, y: number): LaidOutElement | null => {
    const laid = laidOutRef.current;
    for (let i = laid.length - 1; i >= 0; i--) {
      const l = laid[i];
      if (x >= l.ax && x <= l.ax + l.aw && y >= l.ay && y <= l.ay + l.ah) return l;
    }
    return null;
  };

  // Topmost *container* control at a point, excluding a given id and its subtree.
  const containerAt = (
    x: number,
    y: number,
    excludeId: string | null
  ): LaidOutElement | null => {
    const laid = laidOutRef.current;
    const excluded = excludeId ? subtreeIds(excludeId) : new Set<string>();
    for (let i = laid.length - 1; i >= 0; i--) {
      const l = laid[i];
      const def = WIDGET_BY_TYPE.get(l.el.type);
      if (!def?.container) continue;
      if (excluded.has(l.el.id)) continue;
      if (x >= l.ax && x <= l.ax + l.aw && y >= l.ay && y <= l.ay + l.ah) return l;
    }
    return null;
  };

  const subtreeIds = (rootId: string): Set<string> => {
    const set = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of controls) {
        if (c.parentId && set.has(c.parentId) && !set.has(c.id)) {
          set.add(c.id);
          changed = true;
        }
      }
    }
    return set;
  };

  // ---- Drop from toolbox ----
  const onDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(WIDGET_DND_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };
  const onDrop = (e: React.DragEvent) => {
    const widgetType = e.dataTransfer.getData(WIDGET_DND_TYPE);
    if (!widgetType) return;
    e.preventDefault();
    const { x, y } = toBoard(e.clientX, e.clientY);
    const container = containerAt(x, y, null);
    let localX = snap(x);
    let localY = snap(y);
    let parentId: string | null = null;
    if (container) {
      parentId = container.el.id;
      localX = snap(x - container.ax);
      localY = snap(y - container.ay);
    }
    dispatch({ type: "add", widgetType, x: localX, y: localY, parentId });
  };

  // ---- Selection + drag/resize gestures on the overlay ----
  const beginMove = (e: React.PointerEvent, id: string) => {
    const c = byId.get(id);
    if (!c) return;
    // Layout-managed children can't be freely moved — just select them.
    if (isLayoutManaged(id)) {
      dispatch({ type: "select", id });
      return;
    }
    const abs = absoluteRect(c, byId);
    const { x, y } = toBoard(e.clientX, e.clientY);
    dragRef.current = {
      mode: "move",
      id,
      startX: x,
      startY: y,
      origRect: { ...c.rect },
      parentOffX: abs.x - c.rect.x,
      parentOffY: abs.y - c.rect.y,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dispatch({ type: "select", id });
  };

  const beginResize = (e: React.PointerEvent, id: string, handle: HandleDir) => {
    e.stopPropagation();
    const c = byId.get(id);
    if (!c) return;
    if (isLayoutManaged(id)) return; // size is computed by the layout engine
    const { x, y } = toBoard(e.clientX, e.clientY);
    dragRef.current = {
      mode: "resize",
      id,
      handle,
      startX: x,
      startY: y,
      origRect: { ...c.rect },
      parentOffX: 0,
      parentOffY: 0,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onOverlayPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const { x, y } = toBoard(e.clientX, e.clientY);
    const dx = x - d.startX;
    const dy = y - d.startY;

    if (d.mode === "move") {
      dispatch({
        type: "setRect",
        id: d.id,
        rect: { x: snap(d.origRect.x + dx), y: snap(d.origRect.y + dy) },
      });
    } else if (d.mode === "resize" && d.handle) {
      const r = { ...d.origRect };
      const h = d.handle;
      if (h.includes("e")) r.w = Math.max(4, snap(d.origRect.w + dx));
      if (h.includes("s")) r.h = Math.max(4, snap(d.origRect.h + dy));
      if (h.includes("w")) {
        const nx = snap(d.origRect.x + dx);
        r.w = Math.max(4, d.origRect.x + d.origRect.w - nx);
        r.x = nx;
      }
      if (h.includes("n")) {
        const ny = snap(d.origRect.y + dy);
        r.h = Math.max(4, d.origRect.y + d.origRect.h - ny);
        r.y = ny;
      }
      dispatch({ type: "setRect", id: d.id, rect: r });
    }
    forceRerender((n) => n + 1);
  };

  const onOverlayPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.mode !== "move") return;

    // Reparent if the control was dropped over a different container.
    const c = byId.get(d.id);
    if (!c) return;
    const { x, y } = toBoard(e.clientX, e.clientY);
    const container = containerAt(x, y, d.id);
    const newParentId = container ? container.el.id : null;
    if (newParentId !== c.parentId) {
      // Recompute the control's local rect relative to the new parent so it
      // stays visually where the user dropped it.
      const absNow = absoluteRect(c, byId);
      const parentAbsX = container ? container.ax : 0;
      const parentAbsY = container ? container.ay : 0;
      dispatch({
        type: "reparent",
        id: d.id,
        parentId: newParentId,
        rect: {
          ...c.rect,
          x: snap(absNow.x - parentAbsX),
          y: snap(absNow.y - parentAbsY),
        },
      });
    }
  };

  // Click empty canvas area to deselect / select topmost control.
  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toBoard(e.clientX, e.clientY);
    const hit = controlAt(x, y);
    if (hit) {
      beginMove(e, hit.el.id);
    } else {
      dispatch({ type: "select", id: null });
    }
  };

  // Delete key removes the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        // Avoid deleting while typing in an input field.
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        dispatch({ type: "delete", id: selectedId });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, dispatch]);

  // ---- Selection overlay geometry (in CSS pixels over the canvas) ----
  const selected = selectedId ? byId.get(selectedId) : undefined;
  // Use the laid-out rect so the overlay tracks computed layout positions.
  const selAbs = selected ? laidRectOf(selected.id) : null;
  const selManaged = selected ? isLayoutManaged(selected.id) : false;

  // Scale factor from board px to displayed CSS px.
  const displayScale = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const r = canvas.getBoundingClientRect();
    return r.width / board.w;
  };
  const s = displayScale();

  return (
    <div className="design-canvas" ref={wrapRef}>
      <div className="design-canvas__stage">
        {/* Zero-padding relative box so the overlay origin matches the canvas
            top-left exactly (no border/padding offset math needed). */}
        <div className="design-canvas__inner" style={{ position: "relative" }}>
          <canvas
            ref={canvasRef}
            width={board.w}
            height={board.h}
            className="design-canvas__surface"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
            onDragOver={onDragOver}
            onDrop={onDrop}
          />

          {/* Selection outline + resize handles, positioned in CSS pixels.
              Layout-managed children show the outline only (no resize handles),
              since their rect is computed by the flex/grid engine. */}
          {selected && selAbs && (
            <div
              className={"design-sel" + (selManaged ? " design-sel--managed" : "")}
              style={{
                left: selAbs.x * s,
                top: selAbs.y * s,
                width: selAbs.w * s,
                height: selAbs.h * s,
              }}
              // Let pointer move/up reach the canvas handlers during a move drag.
              onPointerMove={onOverlayPointerMove}
              onPointerUp={onOverlayPointerUp}
            >
              {!selManaged &&
                HANDLES.map((h) => (
                  <div
                    key={h}
                    className={`design-handle design-handle--${h}`}
                    onPointerDown={(e) => beginResize(e, selected.id, h)}
                    onPointerMove={onOverlayPointerMove}
                    onPointerUp={onOverlayPointerUp}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
