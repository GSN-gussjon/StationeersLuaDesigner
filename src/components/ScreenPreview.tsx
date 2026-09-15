// Interactive canvas preview of the ScriptedScreens UI. Draws the committed
// scene and routes pointer input back into the running script via the engine's
// dispatchUiEvent. Buttons/toggles/checkboxes fire "click"; sliders fire
// "change" as you drag; selects cycle options and fire "change".

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useStore } from "../state/store";
import { drawElement } from "../runtime/ssDraw";
import { hitTest, layoutScene, type LaidOutElement } from "../runtime/ssLayout";
import type { SceneElement } from "../runtime/ssScene";
import { ScreenSizeControl } from "./ScreenSizeControl";

// A widget is "interactive" for our preview if it accepts a pointer gesture.
function isClickable(el: SceneElement): boolean {
  return (
    el.events.click &&
    (el.type === "button" ||
      el.type === "interface_button" ||
      el.type === "toggle" ||
      el.type === "checkbox" ||
      el.type === "radio")
  );
}
function isSlider(el: SceneElement): boolean {
  return el.type === "slider" && el.events.change;
}
function isSelect(el: SceneElement): boolean {
  return el.type === "select" && el.events.change;
}

export function ScreenPreview() {
  const { state, engineRef } = useStore();
  const scene = state.scene;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const laidOutRef = useRef<LaidOutElement[]>([]);
  const draggingRef = useRef<LaidOutElement | null>(null);
  // Optimistic local value for the slider currently being dragged, so the
  // handle tracks the pointer even before/without the script committing a new
  // value. A subsequent commit (fresh scene) overrides this.
  const sliderOverrideRef = useRef<{ id: string; value: number } | null>(null);

  const width = scene?.width ?? state.screenSize.w;
  const height = scene?.height ?? state.screenSize.h;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    // Screen backdrop (matches the dark board bezel look).
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, width, height);

    if (!scene) {
      ctx.fillStyle = "#475569";
      ctx.font = '12px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Run a script that draws with ss.ui", width / 2, height / 2);
      laidOutRef.current = [];
      return;
    }

    const laid = layoutScene(scene);
    laidOutRef.current = laid;
    const now = performance.now();
    const override = sliderOverrideRef.current;
    for (const l of laid) {
      if (override && l.el.id === override.id) {
        // Draw with the optimistic value without mutating the scene element.
        const patched: LaidOutElement = {
          ...l,
          el: { ...l.el, props: { ...l.el.props, value: override.value } },
        };
        drawElement(ctx, patched, now);
      } else {
        drawElement(ctx, l, now);
      }
    }
  }, [scene, width, height]);

  // Redraw whenever the scene changes. A fresh commit is authoritative, so drop
  // any optimistic slider override unless the user is still actively dragging.
  useLayoutEffect(() => {
    if (!draggingRef.current) sliderOverrideRef.current = null;
    draw();
  }, [draw]);

  // Animation loop for animated widgets (spinner, indeterminate progress) and
  // to keep charts smooth. Only runs while a scene is present.
  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    const hasAnimated = scene.elements.some(
      (e) =>
        e.type === "spinner" ||
        (e.type === "progress" && e.props.indeterminate)
    );
    if (!hasAnimated) return;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, draw]);

  // Map a mouse event to scene coordinates (canvas may be CSS-scaled).
  const toScene = (e: React.PointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = width / rect.width;
    const sy = height / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const sliderValueAt = (
    l: LaidOutElement,
    x: number,
    y: number
  ): number => {
    const min = Number(l.el.props.min ?? 0);
    const max = Number(l.el.props.max ?? 100);
    const dir = String(l.el.props.direction ?? "");
    const vertical = dir === "ttb" || dir === "btt" || l.ah > l.aw;
    let t: number;
    if (vertical) {
      // Vertical: top is high unless btt (bottom-to-top) flips it.
      const frac = Math.max(0, Math.min(1, (y - l.ay) / (l.ah || 1)));
      t = dir === "btt" ? 1 - frac : frac;
    } else {
      const frac = Math.max(0, Math.min(1, (x - l.ax) / (l.aw || 1)));
      t = dir === "rtl" ? 1 - frac : frac;
    }
    return min + t * (max - min);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    if (!engine) return;
    const { x, y } = toScene(e);
    const laid = laidOutRef.current;

    // Slider takes priority for drag.
    const slider = hitTest(laid, x, y, isSlider);
    if (slider) {
      draggingRef.current = slider;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const v = sliderValueAt(slider, x, y);
      sliderOverrideRef.current = { id: slider.el.id, value: v };
      draw(); // reflect the handle position immediately
      engine.dispatchUiEvent(slider.el.id, "change", String(v));
      return;
    }

    const select = hitTest(laid, x, y, isSelect);
    if (select) {
      const opts = Array.isArray(select.el.props.options)
        ? (select.el.props.options as unknown[])
        : String(select.el.props.options ?? "").split("|");
      const cur = Number(String(select.el.props.selected ?? "0").split(",")[0]) || 0;
      const next = opts.length ? (cur + 1) % opts.length : 0;
      engine.dispatchUiEvent(select.el.id, "change", String(next));
      return;
    }

    const clickable = hitTest(laid, x, y, isClickable);
    if (clickable) {
      const value =
        clickable.el.type === "interface_button" ? "1" : undefined;
      engine.dispatchUiEvent(clickable.el.id, "click", value);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const engine = engineRef.current;
    const slider = draggingRef.current;
    if (!engine || !slider) return;
    const { x, y } = toScene(e);
    const v = sliderValueAt(slider, x, y);
    sliderOverrideRef.current = { id: slider.el.id, value: v };
    draw(); // move the handle live while dragging
    engine.dispatchUiEvent(slider.el.id, "change", String(v));
  };

  const onPointerUp = () => {
    draggingRef.current = null;
    // Keep the override until the next commit so the handle doesn't jump back;
    // if the script committed a value, the scene-change effect already cleared it.
  };

  return (
    <div className="screen-preview">
      <div className="screen-preview__bezel">
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="screen-preview__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        />
      </div>
      <div className="screen-preview__caption">
        {scene ? `${scene.surface} · ${width}×${height}` : `${width}×${height}`}
      </div>
      <ScreenSizeControl />
    </div>
  );
}
