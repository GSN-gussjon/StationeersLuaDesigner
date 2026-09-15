// Parser for the StationeersStationpediaExtractor output files.
//
// The exact JSON shape is taken from the extractor's source (Plugin.cs,
// StationeersSPE), so the field names below are ground truth, not guesses.
//
// Stationpedia.json:
//   {
//     version: string,
//     pages: [ {
//       Key, Title, Description, PrefabName, PrefabHash,
//       BasePowerDraw, MaxPressure, GrowthTime,
//       SlotInserts: [...], LogicInsert: [...], LogicSlotInsert: [...],
//       ModeInsert: [...], ConnectionInsert: [...], ConstructedByKits: [...],
//       // merged prefab data:
//       Slots: [ { SlotClass, StringHash, StringKey, SlotName } ],
//       LogicInfo: {
//         LogicSlotTypes: { "<slotIndex>": { "<LogicSlotType>": "Read"|"Write"|"ReadWrite" } },
//         LogicTypes:     { "<LogicType>": "Read"|"Write"|"ReadWrite" }
//       },
//       Device?: {...}, Structure?: {...}, Item?: {...}, ...
//     } ],
//     core_prefabs: [...], reagents: {...}, scriptCommands: {...}, scriptConstants: {...}
//   }
//
// Enums.json:
//   {
//     scriptEnums: { "<TypeName>": { enumName, values: { "<Name>": { value, deprecated, description } } } },
//     basicEnums:  { ... same shape ... }
//   }

import type {
  Catalog,
  EnumTable,
  LogicAccess,
  LogicPropertyDef,
  PrefabDef,
  ReagentDef,
  SlotDef,
  SlotLogicDef,
} from "../domain/types";

export interface ParseResult {
  catalog: Catalog;
  warnings: string[];
}

type Json = Record<string, unknown>;

function asRecord(v: unknown): Json | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null;
}

function accessFromString(raw: unknown): LogicAccess {
  // The extractor writes exactly "Read", "Write", or "ReadWrite".
  switch (raw) {
    case "ReadWrite":
      return "readwrite";
    case "Write":
      return "write";
    case "Read":
    default:
      return "read";
  }
}

/**
 * Parse Enums.json. Returns the numeric value tables we need for LogicType,
 * LogicSlotType and the batch method enum. Deprecated entries are skipped for
 * the value maps used in dropdowns but still contribute their numeric value.
 */
export function parseEnums(rawText: string): EnumTable {
  const root = asRecord(JSON.parse(rawText)) ?? {};
  const scriptEnums = asRecord(root.scriptEnums) ?? {};
  const basicEnums = asRecord(root.basicEnums) ?? {};

  const logicType: Record<string, number> = {};
  const logicSlotType: Record<string, number> = {};
  const batchMode: Record<string, number> = {};
  const reagentMode: Record<string, number> = {};

  // Each listing is { enumName, values: { name: { value, deprecated, description } } }.
  // We match listings by their inner enumName rather than the outer key, since
  // the outer key is a type-string that can vary.
  const readListing = (listing: unknown, target: Record<string, number>) => {
    const rec = asRecord(listing);
    if (!rec) return;
    const values = asRecord(rec.values);
    if (!values) return;
    for (const [name, entry] of Object.entries(values)) {
      const e = asRecord(entry);
      if (e && typeof e.value === "number") target[name] = e.value;
    }
  };

  const scanFor = (
    groups: Json,
    enumName: string,
    target: Record<string, number>
  ) => {
    for (const listing of Object.values(groups)) {
      const rec = asRecord(listing);
      if (rec && rec.enumName === enumName) readListing(rec, target);
    }
  };

  scanFor(scriptEnums, "LogicType", logicType);
  scanFor(scriptEnums, "LogicSlotType", logicSlotType);
  // Batch method enum name in-game is "LogicBatchMethod".
  scanFor(scriptEnums, "LogicBatchMethod", batchMode);
  if (Object.keys(batchMode).length === 0) {
    scanFor(basicEnums, "LogicBatchMethod", batchMode);
  }
  scanFor(scriptEnums, "LogicReagentMode", reagentMode);
  if (Object.keys(reagentMode).length === 0) {
    scanFor(basicEnums, "LogicReagentMode", reagentMode);
  }

  return { logicType, logicSlotType, batchMode, reagentMode };
}

/** Parse a LogicInfo.LogicTypes object: { "<name>": "Read"|"Write"|"ReadWrite" }. */
function parseLogicTypes(
  raw: unknown,
  enumValues: Record<string, number>
): LogicPropertyDef[] {
  const rec = asRecord(raw);
  if (!rec) return [];
  const out: LogicPropertyDef[] = [];
  for (const [name, access] of Object.entries(rec)) {
    out.push({
      name,
      value: enumValues[name] ?? null,
      access: accessFromString(access),
    });
  }
  return out;
}

/**
 * Parse LogicInfo.LogicSlotTypes: { "<slotIndex>": { "<name>": access } }.
 * We flatten into a de-duplicated list of slot logic names with the widest
 * access seen across slots, since the device panel presents them per-type.
 */
function parseSlotLogicTypes(
  raw: unknown,
  enumValues: Record<string, number>
): SlotLogicDef[] {
  const rec = asRecord(raw);
  if (!rec) return [];
  const merged = new Map<string, LogicAccess>();
  for (const perSlot of Object.values(rec)) {
    const slotRec = asRecord(perSlot);
    if (!slotRec) continue;
    for (const [name, access] of Object.entries(slotRec)) {
      const a = accessFromString(access);
      const prev = merged.get(name);
      // Widen access if a later slot allows more.
      if (prev === "readwrite") continue;
      if (prev && prev !== a) merged.set(name, "readwrite");
      else merged.set(name, a);
    }
  }
  return [...merged.entries()].map(([name, access]) => ({
    name,
    value: enumValues[name] ?? null,
    access,
  }));
}

/** Parse the merged Slots array: [ { SlotClass, StringHash, StringKey, SlotName } ]. */
function parseSlots(raw: unknown): SlotDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, i) => {
    const rec = asRecord(entry) ?? {};
    const name = typeof rec.SlotName === "string" ? rec.SlotName : null;
    const cls = typeof rec.SlotClass === "string" ? rec.SlotClass : null;
    return { index: i, typeName: name ?? cls };
  });
}

export function parseCatalog(
  stationpediaText: string,
  enumsText: string | null
): ParseResult {
  const warnings: string[] = [];

  const enums: EnumTable = enumsText
    ? parseEnums(enumsText)
    : {
        logicType: {},
        logicSlotType: {},
        batchMode: {},
        reagentMode: {},
      };

  if (!enumsText) {
    warnings.push(
      "No Enums.json provided — LogicType numeric values will be unavailable (names still work)."
    );
  }

  const root = asRecord(JSON.parse(stationpediaText));
  if (!root) {
    throw new Error("Stationpedia.json root is not an object.");
  }

  const pages = Array.isArray(root.pages) ? root.pages : [];
  if (pages.length === 0) {
    warnings.push(
      'No "pages" array found in Stationpedia.json. Make sure this is the file produced by the Stationpedia Extractor.'
    );
  }

  const prefabs: PrefabDef[] = [];
  const byHash = new Map<number, PrefabDef>();
  const byName = new Map<string, PrefabDef>();

  for (const entry of pages) {
    const rec = asRecord(entry);
    if (!rec) continue;

    const prefabName =
      typeof rec.PrefabName === "string" ? rec.PrefabName : null;
    if (!prefabName) continue;

    const title =
      typeof rec.Title === "string" && rec.Title.length > 0
        ? rec.Title
        : prefabName;
    const prefabHash =
      typeof rec.PrefabHash === "number" ? rec.PrefabHash : 0;

    const logicInfo = asRecord(rec.LogicInfo);
    const logic = logicInfo
      ? parseLogicTypes(logicInfo.LogicTypes, enums.logicType)
      : [];
    const slotLogic = logicInfo
      ? parseSlotLogicTypes(logicInfo.LogicSlotTypes, enums.logicSlotType)
      : [];
    const slots = parseSlots(rec.Slots);

    const def: PrefabDef = {
      prefabName,
      title,
      prefabHash,
      logic,
      slotLogic,
      slots,
    };
    prefabs.push(def);
    if (prefabHash !== 0) byHash.set(prefabHash, def);
    byName.set(prefabName, def);
  }

  prefabs.sort((a, b) => a.title.localeCompare(b.title));

  // Reagents: { "<shortName>": { Id, Hash, Unit, ... } }
  const reagents: ReagentDef[] = [];
  const reagentByHash = new Map<number, ReagentDef>();
  const reagentsRec = asRecord(root.reagents);
  if (reagentsRec) {
    for (const [name, raw] of Object.entries(reagentsRec)) {
      const r = asRecord(raw);
      if (!r) continue;
      const hash = typeof r.Hash === "number" ? r.Hash : null;
      if (hash === null) continue;
      const def: ReagentDef = {
        name,
        hash,
        unit: typeof r.Unit === "string" ? r.Unit : null,
      };
      reagents.push(def);
      reagentByHash.set(hash, def);
    }
    reagents.sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    catalog: { prefabs, byHash, byName, enums, reagents, reagentByHash },
    warnings,
  };
}
