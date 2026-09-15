// Autocomplete entries for the simulator's Lua API (ic.* and ss.*), surfaced in
// the Monaco editor. Signatures follow the confirmed StationeersLua /
// ScriptedScreens documentation. Snippets use ${n:placeholder} tab stops.

export interface ApiCompletion {
  label: string;
  /** "ic" or "ss" for member completions; omitted for globals. */
  scope?: string;
  kind: "function" | "field" | "variable";
  /** Text inserted; defaults to label. */
  insertText?: string;
  /** If true, insertText is treated as a snippet (tab stops). */
  snippet?: boolean;
  detail?: string;
  doc?: string;
}

const icFn = (
  label: string,
  insertText: string,
  detail: string,
  doc?: string
): ApiCompletion => ({
  label,
  scope: "ic",
  kind: "function",
  insertText,
  snippet: true,
  detail,
  doc,
});

const ssFn = (
  label: string,
  insertText: string,
  detail: string,
  doc?: string
): ApiCompletion => ({
  label,
  scope: "ss",
  kind: "function",
  insertText,
  snippet: true,
  detail,
  doc,
});

export const API_COMPLETIONS: ApiCompletion[] = [
  // ---- ic.* device I/O ----
  icFn("read", "read(${1:dev}, ${2:ic.enums.LogicType.On})", "ic.read(dev, logicType [, net])", "Read a logic value from a device pin."),
  icFn("write", "write(${1:dev}, ${2:ic.enums.LogicType.On}, ${3:value})", "ic.write(dev, logicType, value [, net])", "Write a logic value to a device pin."),
  icFn("read_id", "read_id(${1:id}, ${2:ic.enums.LogicType.On})", "ic.read_id(id, logicType [, net])", "Read by device ReferenceId."),
  icFn("write_id", "write_id(${1:id}, ${2:ic.enums.LogicType.On}, ${3:value})", "ic.write_id(id, logicType, value [, net])", "Write by ReferenceId."),
  icFn("read_slot", "read_slot(${1:dev}, ${2:slot}, ${3:ic.enums.LogicSlotType.Occupied})", "ic.read_slot(dev, slot, slotType [, net])", "Read a slot logic value."),
  icFn("write_slot", "write_slot(${1:dev}, ${2:slot}, ${3:ic.enums.LogicSlotType.On}, ${4:value})", "ic.write_slot(dev, slot, slotType, value [, net])", "Write a slot logic value."),
  icFn("find", "find(${1:\"name\"})", "ic.find(name [, mode [, net]])", "Find a device ReferenceId by label."),
  icFn("find_all", "find_all(${1:\"name\"})", "ic.find_all(name [, mode [, net]])", "Find all matching device ReferenceIds."),
  icFn("batch_read", "batch_read(${1:hash}, ${2:ic.enums.LogicType.Temperature}, ${3:ic.enums.LogicBatchMethod.Average})", "ic.batch_read(hash, logicType, method [, net])", "Aggregate a logic value across all devices of a type."),
  icFn("batch_write", "batch_write(${1:hash}, ${2:ic.enums.LogicType.On}, ${3:value})", "ic.batch_write(hash, logicType, value [, net])", "Write a logic value to all devices of a type."),
  icFn("batch_read_name", "batch_read_name(${1:hash}, ${2:nameHash}, ${3:ic.enums.LogicType.Temperature}, ${4:ic.enums.LogicBatchMethod.Average})", "ic.batch_read_name(hash, nameHash, logicType, method)", "Batch read filtered by device name hash."),
  icFn("batch_write_name", "batch_write_name(${1:hash}, ${2:nameHash}, ${3:ic.enums.LogicType.On}, ${4:value})", "ic.batch_write_name(hash, nameHash, logicType, value)", "Batch write filtered by device name hash."),
  icFn("read_reagent", "read_reagent(${1:dev}, ${2:ic.enums.LogicReagentMode.Contents}, ${3:reagentHash})", "ic.read_reagent(dev, mode, hash [, net])", "Read a reagent quantity."),
  icFn("device_list", "device_list()", "ic.device_list([net])", "List all devices on the network."),
  icFn("device_name", "device_name(${1:dev})", "ic.device_name(dev)", "Get a device's display name."),
  icFn("prefab_name", "prefab_name(${1:hash})", "ic.prefab_name(hash)", "Prefab hash -> name."),
  icFn("hash", "hash(${1:\"StructureName\"})", "ic.hash(str)", "Stationeers string hash (CRC32)."),
  icFn("host_info", "host_info()", "ic.host_info()", "Metadata about the chip's host device."),
  icFn("mem_get", "mem_get(${1:dev}, ${2:addr})", "ic.mem_get(dev, addr [, net])", "Read device memory."),
  icFn("mem_put", "mem_put(${1:dev}, ${2:addr}, ${3:value})", "ic.mem_put(dev, addr, value [, net])", "Write device memory."),
  { label: "enums", scope: "ic", kind: "field", detail: "ic.enums", doc: "LogicType / LogicSlotType / LogicBatchMethod / LogicReagentMode tables." },
  { label: "const", scope: "ic", kind: "field", detail: "ic.const", doc: "BASE_UNIT_INDEX, BASE_NETWORK_INDEX." },

  // ---- ss.* ScriptedScreens ----
  { label: "ui", scope: "ss", kind: "field", detail: "ss.ui", doc: "Surface + UI helpers." },
  ssFn("play_sound", "play_sound(${1:ss.sounds.ActivateButton})", "ss.play_sound(name [, opts])", "Play a built-in game sound."),
  { label: "direction", scope: "ss", kind: "field", detail: "ss.direction", doc: "LeftToRight / RightToLeft / TopToBottom / BottomToTop." },
  { label: "sounds", scope: "ss", kind: "field", detail: "ss.sounds", doc: "Built-in sound name tables." },
  ssFn("is_interface_mode", "is_interface_mode()", "ss.is_interface_mode()", "True while capturing keyboard input."),
  ssFn("exit_interface_mode", "exit_interface_mode()", "ss.exit_interface_mode()", "Return to normal game input."),

  // ---- Globals (available everywhere) ----
  {
    label: "tick",
    kind: "function",
    snippet: true,
    insertText: "function tick(dt)\n  $0\nend",
    detail: "function tick(dt)",
    doc: "Called every game tick (~0.5s). dt is delta time in seconds.",
  },
  { label: "hash", kind: "function", snippet: true, insertText: "hash(${1:\"StructureName\"})", detail: "hash(str)", doc: "Stationeers string hash (CRC32)." },
  { label: "device_list", kind: "function", snippet: true, insertText: "device_list()", detail: "device_list([net])", doc: "List all devices on the network." },
  { label: "print", kind: "function", snippet: true, insertText: "print(${1:...})", detail: "print(...)", doc: "Write to the console." },
];
