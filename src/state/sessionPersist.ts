// Persist the user-authored session (script, devices, screen size) to
// localStorage so a page reload restores where you left off.
//
// The dataset (catalog) is intentionally NOT persisted — it's large and loaded
// separately; after reload, load the dataset again for full device editing.
// Console output and transient run/scene state are also excluded.

import type { AppState, ScreenSize } from "./store";
import type { DeviceInstance } from "../domain/device";

const KEY = "stationeers-sim-session";
const VERSION = 1;

interface PersistedSession {
  version: number;
  script: string;
  devices: DeviceInstance[];
  screenSize: ScreenSize;
}

/** The slice of AppState we persist. */
export type PersistableState = Pick<
  AppState,
  "script" | "devices" | "screenSize"
>;

/** Read the persisted session, or null if none / unreadable. */
export function loadSession(): PersistableState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedSession>;
    if (!data || data.version !== VERSION) return null;
    if (typeof data.script !== "string" || !Array.isArray(data.devices)) {
      return null;
    }
    const size =
      data.screenSize &&
      typeof data.screenSize.w === "number" &&
      typeof data.screenSize.h === "number"
        ? data.screenSize
        : { w: 480, h: 272 };
    return {
      script: data.script,
      devices: data.devices as DeviceInstance[],
      screenSize: size,
    };
  } catch {
    // Corrupt/blocked storage: start fresh rather than crashing.
    return null;
  }
}

/** Persist the current session slice. Failures are swallowed (e.g. quota). */
export function saveSession(state: PersistableState): void {
  try {
    const payload: PersistedSession = {
      version: VERSION,
      script: state.script,
      devices: state.devices,
      screenSize: state.screenSize,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors — persistence is best-effort.
  }
}

/** Remove the persisted session. */
export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** localStorage key for designer board/grid preferences (kept in sync with
 *  designerStore's PREFS_KEY). */
const DESIGNER_PREFS_KEY = "stationeers-sim-designer-prefs";

/**
 * Full reset: clear all persisted state (session + designer prefs). Callers
 * typically reload the page afterwards so every store re-initializes from
 * defaults.
 */
export function clearAllPersisted(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(DESIGNER_PREFS_KEY);
  } catch {
    // ignore
  }
}
