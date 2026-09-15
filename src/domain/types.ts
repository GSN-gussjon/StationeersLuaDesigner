// Domain types for the Stationeers device simulator.
//
// The dataset comes from the StationeersStationpediaExtractor mod, which writes
// two files into the game's data directory:
//   - Stationpedia.json  (Items / Structures with their logic types & slots)
//   - Enums.json         (LogicType / LogicSlotType / other enum values)
//
// The exact JSON field names are verified at load time by the parser
// (see src/dataset/parseStationpedia.ts). These types describe the normalized
// model the rest of the app works with, decoupled from the raw file shape.

/** Access mode for a logic property, mirroring the game's Read / Write flags. */
export type LogicAccess = "read" | "write" | "readwrite";

/** A single logic property available on a prefab (e.g. On, Temperature, Setting). */
export interface LogicPropertyDef {
  /** LogicType name as used in scripts, e.g. "Temperature". */
  name: string;
  /** Numeric enum value of the LogicType, when known from Enums.json. */
  value: number | null;
  access: LogicAccess;
}

/** A slot logic property available on a prefab (LogicSlotType). */
export interface SlotLogicDef {
  name: string;
  value: number | null;
  access: LogicAccess;
}

/** One slot on a prefab (e.g. an import slot, a battery slot). */
export interface SlotDef {
  index: number;
  /** Slot type / class name, when provided by the dataset. */
  typeName: string | null;
}

/** A prefab definition from the catalog (a device type). */
export interface PrefabDef {
  /** In-code prefab name, e.g. "StructureBench". */
  prefabName: string;
  /** Human title as shown in Stationpedia, e.g. "Powered Bench". */
  title: string;
  /** Numeric prefab hash (CRC32 of prefabName). */
  prefabHash: number;
  /** Logic (device-level) properties available on this prefab. */
  logic: LogicPropertyDef[];
  /** Slot-level logic properties available on this prefab. */
  slotLogic: SlotLogicDef[];
  /** Slots this prefab exposes. */
  slots: SlotDef[];
}

/** Normalized enum table loaded from Enums.json. */
export interface EnumTable {
  /** LogicType name -> numeric value. */
  logicType: Record<string, number>;
  /** LogicSlotType name -> numeric value. */
  logicSlotType: Record<string, number>;
  /** Batch mode name -> numeric value (Average / Sum / Minimum / Maximum). */
  batchMode: Record<string, number>;
  /** Reagent mode name -> numeric value (TotalContents, ...). */
  reagentMode: Record<string, number>;
}

/** A reagent definition from the dataset's `reagents` table. */
export interface ReagentDef {
  /** Short type name, e.g. "Iron". */
  name: string;
  hash: number;
  unit: string | null;
}

/** The full loaded catalog: all prefabs plus enum tables and reagents. */
export interface Catalog {
  prefabs: PrefabDef[];
  /** Fast lookup by prefab hash. */
  byHash: Map<number, PrefabDef>;
  /** Fast lookup by prefab name. */
  byName: Map<string, PrefabDef>;
  enums: EnumTable;
  /** All reagents, and a hash lookup. */
  reagents: ReagentDef[];
  reagentByHash: Map<number, ReagentDef>;
}
