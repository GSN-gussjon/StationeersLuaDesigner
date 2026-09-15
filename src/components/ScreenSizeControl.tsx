// Configure the simulated display size. Offers a few presets plus custom W×H.
// The chosen size is what ui:size() reports to scripts and what the preview
// canvas uses, so it should be set before running layout-dependent scripts.

import { useState } from "react";
import { useStore } from "../state/store";
import type { ScreenSize } from "../state/store";

/** Common ScriptedScreens surface sizes (board screens are ~480x272). */
const PRESETS: { label: string; size: ScreenSize }[] = [
  { label: "Console 480×272", size: { w: 480, h: 272 } },
  { label: "Square 256×256", size: { w: 256, h: 256 } },
  { label: "Tablet 320×240", size: { w: 320, h: 240 } },
  { label: "Large 640×360", size: { w: 640, h: 360 } },
  { label: "Visor 1920×1080", size: { w: 1920, h: 1080 } },
];

export function ScreenSizeControl() {
  const { state, dispatch } = useStore();
  const { w, h } = state.screenSize;

  const [customW, setCustomW] = useState(String(w));
  const [customH, setCustomH] = useState(String(h));

  const matchedPreset = PRESETS.find((p) => p.size.w === w && p.size.h === h);

  function applyPreset(value: string) {
    if (value === "custom") return;
    const preset = PRESETS.find((p) => `${p.size.w}x${p.size.h}` === value);
    if (preset) {
      dispatch({ type: "setScreenSize", size: preset.size });
      setCustomW(String(preset.size.w));
      setCustomH(String(preset.size.h));
    }
  }

  function applyCustom() {
    const nw = Math.round(Number(customW));
    const nh = Math.round(Number(customH));
    if (!Number.isFinite(nw) || !Number.isFinite(nh) || nw < 16 || nh < 16) {
      return;
    }
    // Clamp to the virtual-resolution ceiling documented for ScriptedScreens.
    const clamp = (n: number) => Math.min(4096, n);
    dispatch({ type: "setScreenSize", size: { w: clamp(nw), h: clamp(nh) } });
  }

  return (
    <div className="screen-size">
      <label className="screen-size__label">Display</label>
      <select
        className="screen-size__select"
        value={matchedPreset ? `${w}x${h}` : "custom"}
        onChange={(e) => applyPreset(e.target.value)}
      >
        {PRESETS.map((p) => (
          <option key={p.label} value={`${p.size.w}x${p.size.h}`}>
            {p.label}
          </option>
        ))}
        <option value="custom">Custom…</option>
      </select>
      <input
        className="screen-size__num"
        value={customW}
        inputMode="numeric"
        aria-label="width"
        onChange={(e) => setCustomW(e.target.value)}
        onBlur={applyCustom}
        onKeyDown={(e) => e.key === "Enter" && applyCustom()}
      />
      <span className="screen-size__x">×</span>
      <input
        className="screen-size__num"
        value={customH}
        inputMode="numeric"
        aria-label="height"
        onChange={(e) => setCustomH(e.target.value)}
        onBlur={applyCustom}
        onKeyDown={(e) => e.key === "Enter" && applyCustom()}
      />
    </div>
  );
}
