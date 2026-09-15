// Save / load the user-authored simulator state (script + devices) to a JSON
// file. The dataset (Stationpedia/Enums) is intentionally NOT included — it's a
// large, separately-loaded artifact; the save references it only so import can
// warn if devices use prefab hashes the current catalog doesn't know.

import type { DeviceInstance } from "../domain/device";
import type { ScreenSize } from "./store";

/** Bump when the on-disk shape changes in a breaking way. */
const SAVE_VERSION = 2;

const DEFAULT_SCREEN: ScreenSize = { w: 480, h: 272 };

export interface SimulatorSave {
  kind: "stationeers-sim-state";
  version: number;
  savedAt: string;
  script: string;
  devices: DeviceInstance[];
  screenSize: ScreenSize;
}

export interface LoadResult {
  script: string;
  devices: DeviceInstance[];
  screenSize: ScreenSize;
  warnings: string[];
}

/** Build the JSON string to download. */
export function serializeState(
  script: string,
  devices: DeviceInstance[],
  screenSize: ScreenSize
): string {
  const save: SimulatorSave = {
    kind: "stationeers-sim-state",
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    script,
    devices,
    screenSize,
  };
  return JSON.stringify(save, null, 2);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Coerce an unknown value into a normalized DeviceInstance, or null if invalid. */
function normalizeDevice(raw: unknown): DeviceInstance | null {
  if (!isRecord(raw)) return null;
  const id =
    typeof raw.id === "string" && raw.id
      ? raw.id
      : `dev_${Math.random().toString(36).slice(2)}`;
  const prefabHash = Number(raw.prefabHash);
  if (!Number.isFinite(prefabHash)) return null;

  const numMap = (v: unknown): Record<number, number> => {
    const out: Record<number, number> = {};
    if (isRecord(v)) {
      for (const [k, val] of Object.entries(v)) {
        const n = Number(val);
        if (Number.isFinite(n)) out[Number(k)] = n;
      }
    }
    return out;
  };
  const strNumMap = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (isRecord(v)) {
      for (const [k, val] of Object.entries(v)) {
        const n = Number(val);
        if (Number.isFinite(n)) out[k] = n;
      }
    }
    return out;
  };
  const slotMap = (v: unknown): Record<number, Record<string, number>> => {
    const out: Record<number, Record<string, number>> = {};
    if (isRecord(v)) {
      for (const [k, val] of Object.entries(v)) out[Number(k)] = strNumMap(val);
    }
    return out;
  };

  const pinRaw = raw.pin;
  const pin =
    pinRaw === null || pinRaw === undefined ? null : Number(pinRaw);

  return {
    id,
    referenceId: Number(raw.referenceId) || 0,
    prefabHash,
    prefabName: typeof raw.prefabName === "string" ? raw.prefabName : "",
    title: typeof raw.title === "string" ? raw.title : String(raw.prefabName ?? ""),
    name: typeof raw.name === "string" ? raw.name : "",
    pin: pin !== null && Number.isFinite(pin) ? pin : null,
    logicValues: strNumMap(raw.logicValues),
    slotValues: slotMap(raw.slotValues),
    memory: numMap(raw.memory),
    reagents: numMap(raw.reagents),
  };
}

/**
 * Parse a save file. Throws on structurally invalid input; returns the loaded
 * script + devices plus any non-fatal warnings (e.g. unknown prefab hashes).
 * @param knownHashes optional set of prefab hashes in the current catalog.
 */
export function parseState(
  text: string,
  knownHashes?: Set<number>
): LoadResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  if (!isRecord(data) || data.kind !== "stationeers-sim-state") {
    throw new Error("This is not a simulator state file.");
  }
  if (typeof data.version === "number" && data.version > SAVE_VERSION) {
    throw new Error(
      `Save version ${data.version} is newer than supported (${SAVE_VERSION}). Update the app.`
    );
  }

  const warnings: string[] = [];
  const script = typeof data.script === "string" ? data.script : "";
  const rawDevices = Array.isArray(data.devices) ? data.devices : [];
  const devices: DeviceInstance[] = [];
  let dropped = 0;
  for (const rd of rawDevices) {
    const d = normalizeDevice(rd);
    if (d) devices.push(d);
    else dropped++;
  }
  if (dropped > 0) warnings.push(`${dropped} device(s) were malformed and skipped.`);

  if (knownHashes) {
    const unknown = devices.filter((d) => !knownHashes.has(d.prefabHash));
    if (unknown.length > 0) {
      warnings.push(
        `${unknown.length} device(s) use prefab hashes not in the loaded dataset — load the matching Stationpedia.json for full editing.`
      );
    }
  }

  // Screen size (added in v2). Fall back to the default for older files.
  let screenSize: ScreenSize = { ...DEFAULT_SCREEN };
  const rawSize = data.screenSize;
  if (isRecord(rawSize)) {
    const w = Math.round(Number(rawSize.w));
    const h = Math.round(Number(rawSize.h));
    if (Number.isFinite(w) && Number.isFinite(h) && w >= 16 && h >= 16) {
      screenSize = { w: Math.min(4096, w), h: Math.min(4096, h) };
    }
  }

  return { script, devices, screenSize, warnings };
}

/** Trigger a browser download of the given text as a .json file. */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
