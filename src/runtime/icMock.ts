// Mock implementation of the StationeersLua `ic` API and its IC10-style global
// aliases, backed by the simulated device network.
//
// Signatures are taken verbatim from the StationeersLua documentation
// (OrbitalFoundryModTeam/StationeersLuaDocs, docs/api/device-io.md, batch.md,
// slots-reagents.md, enums-constants.md, string-hash.md) so scripts behave the
// same as in-game. Anything not backed by real device state (reagents, some
// host metadata) returns conservative defaults and is documented inline.

import type { Catalog, EnumTable } from "../domain/types";
import type { DeviceInstance } from "../domain/device";
import { stationeersHash } from "../domain/device";
import { findByPin, selectBatch } from "../domain/network";

/** Callbacks the host provides so the mock can read/mutate live state. */
export interface IcHostBindings {
  getDevices: () => DeviceInstance[];
  /** Persist a changed logic value on a device (device-level). */
  setLogicValue: (deviceId: string, logicType: string, value: number) => void;
  /** Persist a changed slot logic value. */
  setSlotValue: (
    deviceId: string,
    slot: number,
    slotType: string,
    value: number
  ) => void;
  /** Rename a device (device_label). */
  setDeviceName: (deviceId: string, name: string) => void;
  /** Write a device memory address (mem_put). */
  setMemoryValue: (deviceId: string, addr: number, value: number) => void;
  /** Clear all memory on a device (mem_clear_device). */
  clearMemory: (deviceId: string) => void;
  catalog: Catalog;
  /** Sink for print() and error output. */
  log: (kind: "log" | "error" | "info", text: string) => void;
}

/** Index of the IC housing itself (db), per docs "typically 6". */
const BASE_UNIT_INDEX = 6;
const BASE_NETWORK_INDEX = 0;

/** Clamp a memory address into the valid 0..511 range. */
function clampAddr(addr: number): number {
  const a = Math.trunc(addr);
  if (!Number.isFinite(a) || a < 0) return 0;
  return a > 511 ? 511 : a;
}

/** Reverse an enum value->name lookup for a given numeric logic-type value. */
function nameForValue(
  table: Record<string, number>,
  value: number
): string | null {
  for (const [name, v] of Object.entries(table)) {
    if (v === value) return name;
  }
  return null;
}

/**
 * The `ic` API expects LogicType arguments as numeric enum values (ic.enums.*).
 * Device state is keyed by LogicType *name*. This resolves a numeric value back
 * to the name we store under. If the number isn't a known enum, we also accept
 * that the caller passed a raw name-string (defensive; scripts normally pass
 * ic.enums.*).
 */
function resolveLogicName(
  enums: EnumTable,
  logicType: number | string,
  which: "logicType" | "logicSlotType"
): string | null {
  if (typeof logicType === "string") return logicType;
  return nameForValue(enums[which], logicType);
}

/** Build the `ic` table and the IC10-style globals to inject into Lua. */
export function buildIcApi(bindings: IcHostBindings): {
  ic: Record<string, unknown>;
  globals: Record<string, unknown>;
} {
  const { catalog } = bindings;
  const enums = catalog.enums;

  const deviceByPin = (pin: number): DeviceInstance | undefined => {
    if (pin === BASE_UNIT_INDEX) {
      // The housing itself has no simulated instance; return undefined so reads
      // yield nil, matching a housing with no user-set logic values.
      return undefined;
    }
    return findByPin(bindings.getDevices(), pin);
  };

  const deviceById = (id: number): DeviceInstance | undefined =>
    bindings.getDevices().find((d) => d.referenceId === id);

  // ---- Reads ----

  const readFrom = (
    dev: DeviceInstance | undefined,
    logicType: number | string
  ): number | null => {
    if (!dev) return null;
    const name = resolveLogicName(enums, logicType, "logicType");
    if (name === null) return null;
    const v = dev.logicValues[name];
    return v === undefined ? null : v;
  };

  const read = (dev: number, logicType: number | string): number | null =>
    readFrom(deviceByPin(dev), logicType);

  const read_id = (id: number, logicType: number | string): number | null =>
    readFrom(deviceById(id), logicType);

  // ---- Writes ----

  const writeTo = (
    dev: DeviceInstance | undefined,
    logicType: number | string,
    value: number
  ): void => {
    if (!dev) {
      throw new Error("ic.write: no device at target");
    }
    const name = resolveLogicName(enums, logicType, "logicType");
    if (name === null) throw new Error("ic.write: unknown LogicType");
    bindings.setLogicValue(dev.id, name, value);
  };

  const write = (
    dev: number,
    logicType: number | string,
    value: number
  ): void => writeTo(deviceByPin(dev), logicType, value);

  const write_id = (
    id: number,
    logicType: number | string,
    value: number
  ): void => writeTo(deviceById(id), logicType, value);

  // ---- Slots ----

  const readSlotFrom = (
    dev: DeviceInstance | undefined,
    slot: number,
    slotType: number | string
  ): number | null => {
    if (!dev) return null;
    const name = resolveLogicName(enums, slotType, "logicSlotType");
    if (name === null) return null;
    const v = dev.slotValues[slot]?.[name];
    return v === undefined ? null : v;
  };

  const read_slot = (dev: number, slot: number, slotType: number | string) =>
    readSlotFrom(deviceByPin(dev), slot, slotType);

  const read_slot_id = (id: number, slot: number, slotType: number | string) =>
    readSlotFrom(deviceById(id), slot, slotType);

  const writeSlotTo = (
    dev: DeviceInstance | undefined,
    slot: number,
    slotType: number | string,
    value: number
  ): void => {
    if (!dev) throw new Error("ic.write_slot: no device at target");
    const name = resolveLogicName(enums, slotType, "logicSlotType");
    if (name === null) throw new Error("ic.write_slot: unknown LogicSlotType");
    bindings.setSlotValue(dev.id, slot, name, value);
  };

  const write_slot = (
    dev: number,
    slot: number,
    slotType: number | string,
    value: number
  ) => writeSlotTo(deviceByPin(dev), slot, slotType, value);

  const write_slot_id = (
    id: number,
    slot: number,
    slotType: number | string,
    value: number
  ) => writeSlotTo(deviceById(id), slot, slotType, value);

  // ---- Batch ----

  const aggregate = (values: number[], method: number): number | null => {
    if (values.length === 0) return null;
    const m = enums.batchMode;
    switch (method) {
      case m.Sum:
        return values.reduce((a, b) => a + b, 0);
      case m.Minimum:
        return Math.min(...values);
      case m.Maximum:
        return Math.max(...values);
      case m.Average:
      default:
        return values.reduce((a, b) => a + b, 0) / values.length;
    }
  };

  const batchValues = (
    prefabHash: number,
    nameHash: number | null,
    logicType: number | string
  ): number[] => {
    const name = resolveLogicName(enums, logicType, "logicType");
    if (name === null) return [];
    return selectBatch(bindings.getDevices(), prefabHash, nameHash)
      .map((d) => d.logicValues[name])
      .filter((v): v is number => v !== undefined);
  };

  const batch_read = (
    prefabHash: number,
    logicType: number | string,
    method: number
  ) => aggregate(batchValues(prefabHash, null, logicType), method);

  const batch_read_name = (
    prefabHash: number,
    nameHash: number,
    logicType: number | string,
    method: number
  ) => aggregate(batchValues(prefabHash, nameHash, logicType), method);

  const batch_write = (
    prefabHash: number,
    logicType: number | string,
    value: number
  ): void => {
    const name = resolveLogicName(enums, logicType, "logicType");
    if (name === null) return;
    for (const d of selectBatch(bindings.getDevices(), prefabHash, null)) {
      bindings.setLogicValue(d.id, name, value);
    }
  };

  const batch_write_name = (
    prefabHash: number,
    nameHash: number,
    logicType: number | string,
    value: number
  ): void => {
    const name = resolveLogicName(enums, logicType, "logicType");
    if (name === null) return;
    for (const d of selectBatch(bindings.getDevices(), prefabHash, nameHash)) {
      bindings.setLogicValue(d.id, name, value);
    }
  };

  const batchSlotValues = (
    prefabHash: number,
    nameHash: number | null,
    slot: number,
    slotType: number | string
  ): number[] => {
    const name = resolveLogicName(enums, slotType, "logicSlotType");
    if (name === null) return [];
    return selectBatch(bindings.getDevices(), prefabHash, nameHash)
      .map((d) => d.slotValues[slot]?.[name])
      .filter((v): v is number => v !== undefined);
  };

  const batch_read_slot = (
    prefabHash: number,
    slot: number,
    slotType: number | string,
    method: number
  ) => aggregate(batchSlotValues(prefabHash, null, slot, slotType), method);

  const batch_read_slot_name = (
    prefabHash: number,
    nameHash: number,
    slot: number,
    slotType: number | string,
    method: number
  ) => aggregate(batchSlotValues(prefabHash, nameHash, slot, slotType), method);

  const batch_write_slot = (
    prefabHash: number,
    slot: number,
    slotType: number | string,
    value: number
  ): void => {
    const name = resolveLogicName(enums, slotType, "logicSlotType");
    if (name === null) return;
    for (const d of selectBatch(bindings.getDevices(), prefabHash, null)) {
      bindings.setSlotValue(d.id, slot, name, value);
    }
  };

  const batch_write_slot_name = (
    prefabHash: number,
    nameHash: number,
    slot: number,
    slotType: number | string,
    value: number
  ): void => {
    const name = resolveLogicName(enums, slotType, "logicSlotType");
    if (name === null) return;
    for (const d of selectBatch(bindings.getDevices(), prefabHash, nameHash)) {
      bindings.setSlotValue(d.id, slot, name, value);
    }
  };

  // ---- Find / list / naming ----

  const matchName = (
    deviceName: string,
    query: string,
    mode: string
  ): boolean => {
    switch (mode) {
      case "exact":
        return deviceName === query;
      case "glob": {
        const re = new RegExp(
          "^" +
            query
              .split("*")
              .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
              .join(".*") +
            "$"
        );
        return re.test(deviceName);
      }
      case "regex":
        try {
          return new RegExp(query).test(deviceName);
        } catch {
          return false;
        }
      case "auto":
      default:
        return deviceName === query || deviceName.includes(query);
    }
  };

  const find = (name: string, mode?: string): number | null => {
    const m = typeof mode === "string" ? mode : "auto";
    const hit = bindings
      .getDevices()
      .find((d) => matchName(d.name, name, m));
    return hit ? hit.referenceId : null;
  };

  const find_all = (name: string, mode?: string): number[] => {
    const m = typeof mode === "string" ? mode : "auto";
    return bindings
      .getDevices()
      .filter((d) => matchName(d.name, name, m))
      .map((d) => d.referenceId);
  };

  const device_list = () =>
    bindings.getDevices().map((d) => ({
      ref_id: d.referenceId,
      prefab_hash: d.prefabHash,
      name_hash: stationeersHash(d.name),
      display_name: d.name,
    }));

  const device_name = (dev: number): string | null =>
    deviceByPin(dev)?.name ?? null;

  const device_label = (dev: number, name: string): void => {
    const d = deviceByPin(dev);
    if (d) bindings.setDeviceName(d.id, name);
  };

  const prefab_name = (hashValue: number): string | null =>
    catalog.byHash.get(hashValue)?.prefabName ?? null;

  const host_info = () => ({
    name: "Circuit Housing",
    ref_id: 0,
    prefab_hash: 0,
    type: "circuit_housing",
  });

  // ---- Error / control ----

  const raise_error = (state: number): void => {
    if (state) bindings.log("error", "IC error state raised");
  };
  const clear_error = (): void => {};
  const hcf = (): void => {
    throw new Error("hcf(): halt and catch fire");
  };

  // ---- Reagents ----
  // read_reagent(dev, mode, hash): with a specific reagent hash, returns that
  // reagent's quantity in the device. Modes other than a per-reagent lookup
  // (e.g. TotalContents) return the sum across the device's reagents.
  const read_reagent = (
    dev: number,
    _mode: number,
    hash?: number
  ): number | null => {
    const d = deviceByPin(dev);
    if (!d) return null;
    if (hash !== undefined) return d.reagents[hash] ?? 0;
    // No specific hash: total contents.
    return Object.values(d.reagents).reduce((a, b) => a + b, 0);
  };
  // rmap(dev): reagent hash -> prefab hash map. We don't track the producing
  // prefab per reagent, so map each present reagent hash to itself as a stable
  // key set. Real per-prefab mapping isn't available from device state.
  const rmap = (dev: number): Record<number, number> => {
    const d = deviceByPin(dev);
    if (!d) return {};
    const out: Record<number, number> = {};
    for (const k of Object.keys(d.reagents)) out[Number(k)] = Number(k);
    return out;
  };

  // ---- Device memory (external) ----
  const mem_get = (dev: number, addr: number): number => {
    const d = deviceByPin(dev);
    return d?.memory[addr] ?? 0;
  };
  const mem_put = (dev: number, addr: number, value: number): void => {
    const d = deviceByPin(dev);
    if (d) bindings.setMemoryValue(d.id, addr, value);
  };
  const mem_clear_device = (dev: number): void => {
    const d = deviceByPin(dev);
    if (d) bindings.clearMemory(d.id);
  };
  const mem_get_id = (id: number, addr: number): number =>
    deviceById(id)?.memory[addr] ?? 0;
  const mem_put_id = (id: number, addr: number, value: number): void => {
    const d = deviceById(id);
    if (d) bindings.setMemoryValue(d.id, addr, value);
  };
  const mem_clear_id = (id: number): void => {
    const d = deviceById(id);
    if (d) bindings.clearMemory(d.id);
  };

  // ---- Chip internal memory + stack (this chip's own state, per run) ----
  // 512 addresses per docs; the stack shares this memory.
  const CHIP_MEM_SIZE = 512;
  const chipMem = new Float64Array(CHIP_MEM_SIZE);
  let sp = 0; // stack pointer
  let ra = 0; // return address

  const mem_read = (addr: number): number => chipMem[clampAddr(addr)] ?? 0;
  const mem_write = (addr: number, value: number): void => {
    chipMem[clampAddr(addr)] = value;
  };
  const mem_clear = (): void => {
    chipMem.fill(0);
  };

  const stack_push = (value: number): void => {
    if (sp >= 0 && sp < CHIP_MEM_SIZE) chipMem[sp] = value;
    sp++;
  };
  const stack_pop = (): number => {
    sp = Math.max(0, sp - 1);
    return chipMem[sp] ?? 0;
  };
  const stack_peek = (): number => chipMem[Math.max(0, sp - 1)] ?? 0;
  const stack_poke = (addr: number, value: number): void => {
    chipMem[clampAddr(addr)] = value;
  };
  const stack_get_sp = (): number => sp;
  const stack_set_sp = (v: number): void => {
    sp = v;
  };
  const stack_get_ra = (): number => ra;
  const stack_set_ra = (v: number): void => {
    ra = v;
  };

  const ic: Record<string, unknown> = {
    read,
    write,
    read_id,
    write_id,
    read_slot,
    write_slot,
    read_slot_id,
    write_slot_id,
    batch_read,
    batch_read_name,
    batch_write,
    batch_write_name,
    batch_read_slot,
    batch_read_slot_name,
    batch_write_slot,
    batch_write_slot_name,
    find,
    find_all,
    device_list,
    device_name,
    device_label,
    prefab_name,
    host_info,
    raise_error,
    clear_error,
    hcf,
    read_reagent,
    rmap,
    mem_get,
    mem_put,
    mem_clear_device,
    mem_get_id,
    mem_put_id,
    mem_clear_id,
    mem_read,
    mem_write,
    mem_clear,
    stack_push,
    stack_pop,
    stack_peek,
    stack_poke,
    stack_get_sp,
    stack_set_sp,
    stack_get_ra,
    stack_set_ra,
    // String/hash utilities are documented as globals, but scripts commonly
    // call them via ic.* too; expose both so either form works.
    hash: (s: string) => stationeersHash(s),
    enums: {
      LogicType: enums.logicType,
      LogicSlotType: enums.logicSlotType,
      LogicBatchMethod: enums.batchMode,
      LogicReagentMode: enums.reagentMode,
    },
    const: {
      BASE_UNIT_INDEX,
      BASE_NETWORK_INDEX,
    },
  };

  // IC10-style global aliases documented as equivalents.
  const globals: Record<string, unknown> = {
    logic_read: read,
    logic_write: write,
    logic_batch_read: batch_read,
    logic_batch_write: batch_write,
    device_list,
    device_name,
    device_label,
    prefab_name,
    hash: (s: string) => stationeersHash(s),
    raise_error,
    clear_error,
    hcf,
    // Memory & stack globals (IC10-style names), per docs/api/memory-stack.md.
    mem_get,
    mem_put,
    mem_clear_device,
    mem_get_id,
    mem_put_id,
    mem_clear_id,
    mem_read,
    mem_write,
    mem_clear,
    stack_push,
    stack_pop,
    stack_peek,
    stack_poke,
    stack_get_sp,
    stack_set_sp,
    stack_get_ra,
    stack_set_ra,
    // String utilities (docs/api/string-hash.md).
    pack_ascii6: (s: string) => packAscii6(String(s ?? "")),
    unpack_ascii6: (n: number) => unpackAscii6(Number(n)),
    strip_color_tags: (s: string) => String(s ?? "").replace(/<[^>]+>/g, ""),
    to_int53: (v: number) => Math.trunc(Number(v)),
  };

  return { ic, globals };
}

/** ASCII-6 packing: up to 6 chars into one number (game interop helper). */
function packAscii6(s: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(6, s.length); i++) {
    n = n * 64 + (s.charCodeAt(i) & 0x3f);
  }
  return n;
}

function unpackAscii6(n: number): string {
  const chars: string[] = [];
  let v = Math.trunc(n);
  while (v > 0) {
    chars.unshift(String.fromCharCode(v & 0x3f));
    v = Math.floor(v / 64);
  }
  return chars.join("");
}
