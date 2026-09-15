// Runtime model for a device instance placed in the simulated network.

/** A concrete device instance placed into the simulated data network. */
export interface DeviceInstance {
  /** Stable client-side id used by the UI (not the in-game ReferenceId). */
  id: string;
  /** In-game ReferenceId. Optional; auto-generated if the user leaves it blank. */
  referenceId: number;
  /** Prefab hash this instance is based on. */
  prefabHash: number;
  /** Cached prefab name for display without a catalog lookup. */
  prefabName: string;
  /** Cached display title. */
  title: string;
  /** User-assigned device name (as set with the Labeller in-game). */
  name: string;
  /**
   * Pin assignment on the IC (d0..d5), or null when the device is only
   * reachable over the network by name/type (batch addressing).
   */
  pin: number | null;
  /**
   * Current values of device-level logic properties, keyed by LogicType name.
   * Only properties the user has added are present, matching ic10.dev where you
   * explicitly add each property you want to simulate.
   */
  logicValues: Record<string, number>;
  /**
   * Current values of slot logic properties: slotIndex -> LogicSlotType -> value.
   */
  slotValues: Record<number, Record<string, number>>;
  /**
   * Device memory (the addressable memory reached via mem_get/mem_put and IC10
   * get/put on this device). Sparse map of address -> value. Present on devices
   * that expose memory (e.g. Logic Sorter, Memory chips); edited in the Stack tab.
   */
  memory: Record<number, number>;
  /**
   * Reagent contents: reagentHash -> quantity. Read via ic.read_reagent and
   * enumerated via ic.rmap. Edited in the Reagents tab.
   */
  reagents: Record<number, number>;
}

/** Pins available on a standard IC housing. */
export const IC_PINS = [0, 1, 2, 3, 4, 5] as const;
export type IcPin = (typeof IC_PINS)[number];

/**
 * CRC32-based prefab hash, matching Stationeers' hashing of prefab names and
 * device labels. Used so scripts can reference devices by HASH("name").
 */
export function stationeersHash(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) & 0xff;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  // Stationeers exposes hashes as signed 32-bit integers.
  return (~crc) | 0;
}
