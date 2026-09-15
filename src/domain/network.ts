// Device construction and network-addressing helpers.
//
// This is the layer the ic.* mock (task #6) calls into: it knows how to find a
// device by pin, and how to select a set of devices by name-hash + prefab-hash
// for batch operations, mirroring how Stationeers addresses devices.

import type { Catalog, PrefabDef } from "./types";
import type { DeviceInstance } from "./device";
import { stationeersHash } from "./device";

let deviceSeq = 0;

/** Options for creating a device instance from a prefab. */
export interface CreateDeviceOptions {
  prefab: PrefabDef;
  name: string;
  pin: number | null;
  /** Explicit ReferenceId, or undefined to auto-generate one. */
  referenceId?: number;
}

/** Create a fresh DeviceInstance from a prefab definition. */
export function createDevice(opts: CreateDeviceOptions): DeviceInstance {
  const { prefab, name, pin } = opts;
  return {
    id: `dev_${++deviceSeq}_${Date.now().toString(36)}`,
    referenceId: opts.referenceId ?? generateReferenceId(),
    prefabHash: prefab.prefabHash,
    prefabName: prefab.prefabName,
    title: prefab.title,
    name,
    pin,
    logicValues: {},
    slotValues: {},
    memory: {},
    reagents: {},
  };
}

/**
 * Generate a plausible ReferenceId. In-game these are large integers; a random
 * positive 31-bit value is close enough for simulation and avoids collisions.
 */
function generateReferenceId(): number {
  return Math.floor(Math.random() * 0x7fffffff) + 1;
}

/** Find the device assigned to a given IC pin (d0..d5), or undefined. */
export function findByPin(
  devices: DeviceInstance[],
  pin: number
): DeviceInstance | undefined {
  return devices.find((d) => d.pin === pin);
}

/**
 * Select devices for a batch operation by prefab type hash, optionally
 * filtered by a device name hash. Passing nameHash === null selects all
 * devices of the given prefab type (plain batch); passing a nameHash narrows
 * to devices whose label hashes to that value (named batch).
 *
 * Devices are returned sorted by name then id, matching the in-game note that
 * batch devices are ordered by name.
 */
export function selectBatch(
  devices: DeviceInstance[],
  prefabHash: number,
  nameHash: number | null
): DeviceInstance[] {
  const selected = devices.filter((d) => {
    if (d.prefabHash !== prefabHash) return false;
    if (nameHash === null) return true;
    return stationeersHash(d.name) === nameHash;
  });
  selected.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return selected;
}

/** Resolve a prefab hash to its title/name for display, if the catalog has it. */
export function prefabLabel(catalog: Catalog, prefabHash: number): string {
  return catalog.byHash.get(prefabHash)?.title ?? String(prefabHash);
}
