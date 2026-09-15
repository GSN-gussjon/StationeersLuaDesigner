// Canvas drawing for ScriptedScreens widgets. Each element type is drawn from
// its documented props/style. This is an approximation of the in-game renderer
// intended for layout/interaction preview, not pixel-perfect parity.

import type { SceneElement } from "./ssScene";
import type { LaidOutElement } from "./ssLayout";

function str(v: unknown, dflt = ""): string {
  return v === undefined || v === null ? dflt : String(v);
}
function num(v: unknown, dflt = 0): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : dflt;
}
function bool(v: unknown, dflt = false): boolean {
  if (v === undefined || v === null) return dflt;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

/** Stationeers colors are hex strings, possibly with 8-digit alpha (#RRGGBBAA). */
function color(v: unknown, dflt = "#000000"): string {
  const s = str(v, dflt);
  if (/^#[0-9a-fA-F]{8}$/.test(s)) {
    // Canvas wants #RRGGBBAA -> rgba(). Convert.
    const r = parseInt(s.slice(1, 3), 16);
    const g = parseInt(s.slice(3, 5), 16);
    const b = parseInt(s.slice(5, 7), 16);
    const a = parseInt(s.slice(7, 9), 16) / 255;
    return `rgba(${r},${g},${b},${a})`;
  }
  return s;
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  l: LaidOutElement,
  fill: string
) {
  ctx.fillStyle = fill;
  ctx.fillRect(l.ax, l.ay, l.aw, l.ah);
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  l: LaidOutElement,
  style: Record<string, unknown>
) {
  const fs = num(style.font_size, 16);
  const align = str(style.align, "left");
  ctx.fillStyle = color(style.color, "#FFFFFF");
  ctx.font = `${fs}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  // Strip TMP rich-text tags for the preview (approximation).
  const clean = text.replace(/<[^>]+>/g, "");
  let tx = l.ax + 4;
  ctx.textAlign = "left";
  if (align === "center") {
    tx = l.ax + l.aw / 2;
    ctx.textAlign = "center";
  } else if (align === "right") {
    tx = l.ax + l.aw - 4;
    ctx.textAlign = "right";
  }
  ctx.fillText(clean, tx, l.ay + l.ah / 2);
}

/** Draw a single element. `now` is a timestamp for animated widgets. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  l: LaidOutElement,
  now: number
) {
  const el = l.el;
  const s = el.style;
  const p = el.props;

  switch (el.type) {
    // flex/grid are designer-only layout containers rendered as panels.
    case "flex":
    case "grid":
    case "panel": {
      if (s.bg) drawRect(ctx, l, color(s.bg));
      break;
    }
    case "label": {
      drawText(ctx, str(p.text), l, s);
      break;
    }
    case "button":
    case "interface_button": {
      drawRect(ctx, l, color(s.bg, "#334155"));
      drawText(ctx, str(p.text, el.type === "interface_button" ? "INTERFACE" : ""), l, {
        ...s,
        align: "center",
        color: s.text ?? "#FFFFFF",
      });
      break;
    }
    case "toggle": {
      const on = bool(p.value);
      drawRoundedRect(
        ctx,
        l.ax,
        l.ay,
        l.aw,
        l.ah,
        Math.min(l.ah / 2, l.aw / 2),
        color(on ? s.on_color : s.off_color, on ? "#22C55E" : "#334155")
      );
      const knobR = l.ah / 2 - 2;
      const knobX = on ? l.ax + l.aw - knobR - 2 : l.ax + knobR + 2;
      ctx.beginPath();
      ctx.arc(knobX, l.ay + l.ah / 2, knobR, 0, Math.PI * 2);
      ctx.fillStyle = color(s.knob, "#FFFFFF");
      ctx.fill();
      break;
    }
    case "checkbox": {
      const box = Math.min(l.ah, 18);
      ctx.strokeStyle = color(s.check_color, "#22C55E");
      ctx.lineWidth = 2;
      ctx.strokeRect(l.ax + 1, l.ay + (l.ah - box) / 2, box, box);
      if (bool(p.checked)) {
        ctx.fillStyle = color(s.check_color, "#22C55E");
        ctx.fillRect(l.ax + 4, l.ay + (l.ah - box) / 2 + 3, box - 6, box - 6);
      }
      drawText(ctx, str(p.text), { ...l, ax: l.ax + box + 8 }, s);
      break;
    }
    case "radio": {
      const r = Math.min(l.ah, 16) / 2;
      const cx = l.ax + r + 1;
      const cy = l.ay + l.ah / 2;
      ctx.strokeStyle = color(s.radio_color, "#22C55E");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      if (bool(p.selected)) {
        ctx.fillStyle = color(s.radio_color, "#22C55E");
        ctx.beginPath();
        ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
        ctx.fill();
      }
      drawText(ctx, str(p.text), { ...l, ax: l.ax + r * 2 + 8 }, s);
      break;
    }
    case "slider": {
      const min = num(p.min, 0);
      const max = num(p.max, 100);
      const val = num(p.value, min);
      const t = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0;
      const dir = str(p.direction);
      const vertical = dir === "ttb" || dir === "btt" || l.ah > l.aw;
      const trackBg = color(s.bg, "#1E293B");
      const fillC = color(s.fill, "#3B82F6");
      const handleC = color(s.handle, "#FFFFFF");
      if (vertical) {
        const cx = l.ax + l.aw / 2;
        // btt: value grows upward (handle near bottom at 0). ttb: downward.
        const handleY =
          dir === "btt" ? l.ay + (1 - t) * l.ah : l.ay + t * l.ah;
        drawRect(ctx, { ...l, ax: cx - 2, aw: 4 }, trackBg);
        ctx.fillStyle = fillC;
        if (dir === "btt") ctx.fillRect(cx - 2, handleY, 4, l.ay + l.ah - handleY);
        else ctx.fillRect(cx - 2, l.ay, 4, handleY - l.ay);
        ctx.beginPath();
        ctx.arc(cx, handleY, l.aw / 2 - 1, 0, Math.PI * 2);
        ctx.fillStyle = handleC;
        ctx.fill();
      } else {
        const frac = dir === "rtl" ? 1 - t : t;
        const handleX = l.ax + frac * l.aw;
        drawRect(ctx, { ...l, ay: l.ay + l.ah / 2 - 2, ah: 4 }, trackBg);
        ctx.fillStyle = fillC;
        if (dir === "rtl") ctx.fillRect(handleX, l.ay + l.ah / 2 - 2, l.aw - frac * l.aw, 4);
        else ctx.fillRect(l.ax, l.ay + l.ah / 2 - 2, l.aw * t, 4);
        ctx.beginPath();
        ctx.arc(handleX, l.ay + l.ah / 2, l.ah / 2 - 1, 0, Math.PI * 2);
        ctx.fillStyle = handleC;
        ctx.fill();
      }
      break;
    }
    case "select": {
      drawRect(ctx, l, color(s.bg, "#1E293B"));
      const opts = optionList(p.options);
      const sel = num(String(p.selected ?? "0").split(",")[0], 0);
      const label = opts[sel] ?? "";
      drawText(ctx, label, l, { ...s, color: s.text ?? "#E2E8F0" });
      // chevron
      ctx.fillStyle = color(s.text, "#E2E8F0");
      ctx.beginPath();
      const cx = l.ax + l.aw - 12;
      const cy = l.ay + l.ah / 2;
      ctx.moveTo(cx - 4, cy - 2);
      ctx.lineTo(cx + 4, cy - 2);
      ctx.lineTo(cx, cy + 3);
      ctx.fill();
      break;
    }
    case "textinput": {
      drawRect(ctx, l, color(s.bg, "#0F172A"));
      const v = str(p.value);
      if (v) drawText(ctx, v, l, { ...s, color: s.text ?? "#E2E8F0" });
      else
        drawText(ctx, str(p.placeholder), l, {
          ...s,
          color: s.placeholder_color ?? "#475569",
        });
      break;
    }
    case "progress": {
      const min = num(p.min, 0);
      const max = num(p.max, 1);
      const val = num(p.value, min);
      const t = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0;
      drawRect(ctx, l, color(s.bg, "#1E293B"));
      ctx.fillStyle = color(s.fill, "#22C55E");
      if (bool(p.indeterminate)) {
        const w = l.aw * 0.3;
        const x = l.ax + ((now / 1000) % 1) * (l.aw - w);
        ctx.fillRect(x, l.ay, w, l.ah);
      } else {
        ctx.fillRect(l.ax, l.ay, l.aw * t, l.ah);
      }
      break;
    }
    case "divider": {
      drawRect(ctx, l, color(s.color, "#334155"));
      break;
    }
    case "line": {
      ctx.strokeStyle = color(s.color, "#FFFFFF");
      ctx.lineWidth = num(s.thickness, 2);
      ctx.beginPath();
      ctx.moveTo(l.ax + num(p.x1), l.ay + num(p.y1));
      // line uses absolute-ish coords relative to surface; approximate by
      // treating x1/y1/x2/y2 as surface pixels offset by parent.
      ctx.lineTo(l.ax + num(p.x2) - num(p.x1), l.ay + num(p.y2) - num(p.y1));
      ctx.stroke();
      break;
    }
    case "rect_outline":
    case "border": {
      ctx.strokeStyle = color(s.color, "#FFFFFF");
      ctx.lineWidth = num(s.thickness, 2);
      ctx.strokeRect(l.ax, l.ay, l.aw, l.ah);
      break;
    }
    case "circle": {
      const cx = l.ax + l.aw / 2;
      const cy = l.ay + l.ah / 2;
      const rx = l.aw / 2;
      const ry = l.ah / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (p.filled === false || p.filled === 0 || p.filled === "0" || p.filled === "false") {
        ctx.strokeStyle = color(s.color, "#FFFFFF");
        ctx.lineWidth = num(s.thickness, 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = color(s.bg, "#FFFFFF");
        ctx.fill();
      }
      break;
    }
    case "spinner": {
      const cx = l.ax + l.aw / 2;
      const cy = l.ay + l.ah / 2;
      const r = Math.min(l.aw, l.ah) / 2 - num(s.thickness, 4);
      const speed = num(s.speed, 2);
      const arc = num(s.arc_length, 0.3);
      const start = ((now / 1000) * speed * Math.PI * 2) % (Math.PI * 2);
      if (s.track_color) {
        ctx.strokeStyle = color(s.track_color);
        ctx.lineWidth = num(s.thickness, 4);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = color(s.color, "#38BDF8");
      ctx.lineWidth = num(s.thickness, 4);
      ctx.beginPath();
      ctx.arc(cx, cy, r, start, start + arc * Math.PI * 2);
      ctx.stroke();
      break;
    }
    case "sparkline": {
      drawSparkline(ctx, l);
      break;
    }
    case "linechart": {
      drawLineChart(ctx, l);
      break;
    }
    case "gauge": {
      drawGauge(ctx, l);
      break;
    }
    case "barchart": {
      drawBarChart(ctx, l);
      break;
    }
    case "table": {
      drawTable(ctx, l);
      break;
    }
    case "scrollview": {
      // Container: draw its background; children are drawn as normal elements
      // (the mock parents them under this id, so layout already offsets them).
      drawRect(ctx, l, color(s.bg, "#0F172A"));
      break;
    }
    case "icon": {
      drawIcon(ctx, l);
      break;
    }
    case "image":
    case "media": {
      drawMediaPlaceholder(ctx, l, el.type);
      break;
    }
    default: {
      // Unknown/unsupported widget: draw a labelled placeholder so it's visible.
      ctx.strokeStyle = "#475569";
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(l.ax, l.ay, l.aw, l.ah);
      ctx.setLineDash([]);
      ctx.fillStyle = "#64748B";
      ctx.font = '10px "Segoe UI", sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(el.type, l.ax + 3, l.ay + 3);
      break;
    }
  }
}

function optionList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x));
  if (typeof v === "string") return v.split("|");
  if (v && typeof v === "object") {
    // Lua arrays arrive as objects with 1-based numeric keys.
    return Object.values(v as Record<string, unknown>).map((x) => String(x));
  }
  return [];
}

function drawSparkline(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  const s = l.el.style;
  const data = l.el.data ?? dataFromProps(l.el);
  if (s.bg) drawRect(ctx, l, color(s.bg, "#111827"));
  if (data.length < 2) return;
  let lo = num(l.el.props.min, Math.min(...data));
  let hi = num(l.el.props.max, Math.max(...data));
  if (hi === lo) hi = lo + 1;
  const stepX = l.aw / (data.length - 1);
  const yFor = (v: number) => l.ay + l.ah - ((v - lo) / (hi - lo)) * l.ah;

  // fill under line
  if (s.fill_color) {
    ctx.beginPath();
    ctx.moveTo(l.ax, l.ay + l.ah);
    data.forEach((v, i) => ctx.lineTo(l.ax + i * stepX, yFor(v)));
    ctx.lineTo(l.ax + (data.length - 1) * stepX, l.ay + l.ah);
    ctx.closePath();
    ctx.fillStyle = color(s.fill_color);
    ctx.fill();
  }
  // line
  ctx.strokeStyle = color(s.line_color, "#22C55E");
  ctx.lineWidth = num(s.thickness, 2);
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = l.ax + i * stepX;
    const y = yFor(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawLineChart(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  const s = l.el.style;
  const p = l.el.props;
  if (s.bg) drawRect(ctx, l, color(s.bg, "#111827"));
  const series = seriesFromProps(p.series);
  const colors = optionList(p.series_colors);
  const all = series.flat();
  if (all.length < 2) return;
  let lo = num(p.min, Math.min(...all));
  let hi = num(p.max, Math.max(...all));
  if (hi === lo) hi = lo + 1;
  series.forEach((data, si) => {
    if (data.length < 2) return;
    const stepX = l.aw / (data.length - 1);
    ctx.strokeStyle = color(colors[si], defaultSeriesColor(si));
    ctx.lineWidth = num(s.thickness, 2);
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = l.ax + i * stepX;
      const y = l.ay + l.ah - ((v - lo) / (hi - lo)) * l.ah;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
}

function drawGauge(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  // A 180° arc gauge with normal/warn/danger colored zones, a needle, and a
  // value + optional label centered under the arc. Matches ScriptedScreens'
  // documented gauge (docs/api/gauge.md).
  const p = l.el.props;
  const s = l.el.style;

  const min = num(p.min, 0);
  const max = num(p.max, 100);
  const val = num(p.value, min);
  const t = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0;

  const warn = num(p.warn, 0.6);
  const danger = num(p.danger, 0.85);
  const invert = bool(p.invert);

  const thickness = num(s.arc_thickness, 10);
  // Center the arc so the semicircle + its center sit within the rect.
  const cx = l.ax + l.aw / 2;
  const r = Math.max(6, Math.min(l.aw / 2, l.ah) - thickness / 2 - 2);
  const cy = l.ay + Math.min(l.ah - 2, r + thickness / 2 + 2);

  // 180° sweep across the top: from PI (left) to 2*PI (right), clockwise.
  const A0 = Math.PI;
  const A1 = 2 * Math.PI;
  const angleAt = (frac: number) => A0 + (A1 - A0) * frac;

  const normalColor = color(s.normal_color, "#22C55E");
  const warnColor = color(s.warn_color, "#EAB308");
  const dangerColor = color(s.danger_color, "#EF4444");

  // Zone boundaries as fractions along the arc. When inverted, danger is on
  // the left (low values).
  const zones: Array<{ from: number; to: number; c: string }> = invert
    ? [
        { from: 0, to: 1 - danger, c: dangerColor },
        { from: 1 - danger, to: 1 - warn, c: warnColor },
        { from: 1 - warn, to: 1, c: normalColor },
      ]
    : [
        { from: 0, to: warn, c: normalColor },
        { from: warn, to: danger, c: warnColor },
        { from: danger, to: 1, c: dangerColor },
      ];

  ctx.lineWidth = thickness;
  ctx.lineCap = "butt";
  for (const z of zones) {
    if (z.to <= z.from) continue;
    ctx.strokeStyle = z.c;
    ctx.beginPath();
    ctx.arc(cx, cy, r, angleAt(z.from), angleAt(z.to));
    ctx.stroke();
  }

  // Optional thin arc border on top of the zones.
  if (s.arc_color) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = color(s.arc_color);
    ctx.beginPath();
    ctx.arc(cx, cy, r + thickness / 2, A0, A1);
    ctx.stroke();
  }

  // Needle.
  const needleA = angleAt(t);
  const needleLen = r - thickness / 2 - 2;
  ctx.strokeStyle = color(s.needle_color, "#FFFFFF");
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(needleA) * needleLen, cy + Math.sin(needleA) * needleLen);
  ctx.stroke();
  // Needle hub.
  ctx.fillStyle = color(s.needle_color, "#FFFFFF");
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // Value text (value + unit) and optional label, under the arc center.
  const fs = num(s.font_size, 12);
  const valueText = formatGaugeValue(val) + str(p.unit, "");
  ctx.fillStyle = color(s.value_color, "#E2E8F0");
  ctx.font = `${fs}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(valueText, cx, cy - 4);
  const label = str(p.label, "");
  if (label) {
    ctx.fillStyle = color(s.label_color, "#64748B");
    ctx.font = `${Math.max(9, fs - 2)}px "Segoe UI", sans-serif`;
    ctx.fillText(label, cx, cy + fs);
  }
}

/** Format a gauge value: drop trailing decimals for whole numbers. */
function formatGaugeValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return (Math.round(v * 10) / 10).toString();
}

function drawBarChart(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  const p = l.el.props;
  const s = l.el.style;
  if (s.bg) drawRect(ctx, l, color(s.bg, "#111827"));

  // Values from props.values, or the rolling push buffer (streaming mode).
  const values =
    l.el.data && l.el.data.length ? l.el.data : numArray(p.values);
  if (values.length === 0) return;
  const labels = strArray(p.labels);
  const colors = strArray(p.colors);

  const min = num(p.min, 0);
  const max = num(p.max, Math.max(...values, 1));
  const range = max - min || 1;
  const gap = num(s.gap, 4);
  const fs = num(s.font_size, 9);
  const showValues = bool(s.show_values);

  const labelH = labels.length ? fs + 2 : 0;
  const valueH = showValues ? fs + 2 : 0;
  const chartTop = l.ay + valueH;
  const chartH = l.ah - labelH - valueH;
  const barW = (l.aw - gap * (values.length - 1)) / values.length;

  values.forEach((v, i) => {
    const t = Math.max(0, Math.min(1, (v - min) / range));
    const h = chartH * t;
    const x = l.ax + i * (barW + gap);
    const y = chartTop + (chartH - h);
    ctx.fillStyle = colors.length
      ? color(colors[i % colors.length])
      : color(s.bar_color, "#3B82F6");
    ctx.fillRect(x, y, barW, h);

    if (showValues) {
      ctx.fillStyle = color(s.value_color, "#E2E8F0");
      ctx.font = `${fs}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(formatNum(v), x + barW / 2, y - 1);
    }
    if (labels[i]) {
      ctx.fillStyle = color(s.label_color, "#94A3B8");
      ctx.font = `${fs}px "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(labels[i], x + barW / 2, l.ay + l.ah - labelH + 1);
    }
  });
}

function drawTable(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  const p = l.el.props;
  const s = l.el.style;
  const columns = strArray(p.columns);
  const rows = asRows(p.rows);
  const fs = num(s.font_size, 11);
  const rowHeight = num(s.row_height, 22);
  const weights = numArray(p.col_widths);
  const nCols = Math.max(columns.length, ...rows.map((r) => r.length), 1);
  const totalW = weights.length
    ? weights.reduce((a, b) => a + b, 0)
    : nCols;
  const colX: number[] = [];
  const colW: number[] = [];
  let acc = l.ax;
  for (let c = 0; c < nCols; c++) {
    const w = ((weights[c] ?? 1) / totalW) * l.aw;
    colX.push(acc);
    colW.push(w);
    acc += w;
  }

  const selectedRow = num(p.selected_row, 0); // 1-based, 0 = none

  // Header
  drawRect(ctx, { ...l, ah: rowHeight }, color(s.header_bg, "#1E293B"));
  ctx.font = `${fs}px "Segoe UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  columns.forEach((c, i) => {
    ctx.fillStyle = color(s.header_color, "#94A3B8");
    ctx.fillText(c, colX[i] + 4, l.ay + rowHeight / 2);
  });

  // Rows (clipped to the table rect)
  ctx.save();
  ctx.beginPath();
  ctx.rect(l.ax, l.ay + rowHeight, l.aw, l.ah - rowHeight);
  ctx.clip();
  rows.forEach((row, ri) => {
    const y = l.ay + rowHeight + ri * rowHeight;
    const isSel = ri + 1 === selectedRow;
    const bg = isSel
      ? color(s.selected_bg, "#1E3A5F")
      : color(ri % 2 === 0 ? s.row_bg : s.alt_row_bg, ri % 2 === 0 ? "#111827" : "#0F172A");
    ctx.fillStyle = bg;
    ctx.fillRect(l.ax, y, l.aw, rowHeight);
    row.forEach((cell, ci) => {
      const { text, cellColor } = cellValue(cell);
      ctx.fillStyle = cellColor
        ? color(cellColor)
        : isSel
          ? color(s.selected_color, "#67E8F9")
          : color(s.row_color, "#E2E8F0");
      ctx.fillText(text, (colX[ci] ?? l.ax) + 4, y + rowHeight / 2);
    });
  });
  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, l: LaidOutElement) {
  // No icon atlas in the preview: draw a tinted rounded square with the icon
  // name so it's identifiable.
  const p = l.el.props;
  const s = l.el.style;
  const tint = color(s.tint, "#94A3B8");
  drawRoundedRect(ctx, l.ax, l.ay, l.aw, l.ah, 3, "rgba(148,163,184,0.15)");
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1;
  ctx.strokeRect(l.ax + 0.5, l.ay + 0.5, l.aw - 1, l.ah - 1);
  const name = str(p.name).replace(/^[a-z]+:/, "");
  if (name && l.aw > 24) {
    ctx.fillStyle = tint;
    ctx.font = '9px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 8), l.ax + l.aw / 2, l.ay + l.ah / 2);
  }
}

function drawMediaPlaceholder(
  ctx: CanvasRenderingContext2D,
  l: LaidOutElement,
  kind: string
) {
  drawRect(ctx, l, "#0B0F14");
  ctx.strokeStyle = "#334155";
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(l.ax + 0.5, l.ay + 0.5, l.aw - 1, l.ah - 1);
  ctx.setLineDash([]);
  // A play-triangle glyph for media, or "IMG" for image.
  ctx.fillStyle = "#64748B";
  if (kind === "media") {
    const cx = l.ax + l.aw / 2;
    const cy = l.ay + l.ah / 2;
    const r = Math.min(l.aw, l.ah) / 6;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.lineTo(cx + r, cy);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("IMG", l.ax + l.aw / 2, l.ay + l.ah / 2);
  }
  const url = str(l.el.props.url);
  if (url && l.aw > 60) {
    ctx.fillStyle = "#475569";
    ctx.font = '8px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(url.slice(0, 40), l.ax + l.aw / 2, l.ay + l.ah - 2);
  }
}

function numArray(v: unknown): number[] {
  if (Array.isArray(v)) return v.map((x) => num(x));
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).map((x) => num(x));
  return [];
}
function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => str(x));
  if (v && typeof v === "object")
    return Object.values(v as Record<string, unknown>).map((x) => str(x));
  return [];
}
function asRows(v: unknown): unknown[][] {
  const arr = Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? Object.values(v as Record<string, unknown>)
      : [];
  return arr.map((row) =>
    Array.isArray(row)
      ? row
      : row && typeof row === "object"
        ? Object.values(row as Record<string, unknown>)
        : [row]
  );
}
/** A table cell is a plain value or { text, style = { color } }. */
function cellValue(cell: unknown): { text: string; cellColor?: string } {
  if (cell && typeof cell === "object" && !Array.isArray(cell)) {
    const c = cell as Record<string, unknown>;
    const st = c.style as Record<string, unknown> | undefined;
    return { text: str(c.text), cellColor: st ? str(st.color) : undefined };
  }
  return { text: str(cell) };
}
function formatNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function dataFromProps(el: SceneElement): number[] {
  const d = el.props.data;
  if (Array.isArray(d)) return d.map((x) => num(x));
  if (d && typeof d === "object")
    return Object.values(d as Record<string, unknown>).map((x) => num(x));
  return [];
}

function seriesFromProps(v: unknown): number[][] {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : Object.values(v as Record<string, unknown>);
  return arr.map((row) =>
    Array.isArray(row)
      ? row.map((x) => num(x))
      : Object.values(row as Record<string, unknown>).map((x) => num(x))
  );
}

function defaultSeriesColor(i: number): string {
  const palette = ["#22C55E", "#EF4444", "#3B82F6", "#EAB308", "#A855F7"];
  return palette[i % palette.length];
}
