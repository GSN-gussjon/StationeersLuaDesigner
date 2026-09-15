// Built-in icon atlas catalog for the icon picker, transcribed verbatim from
// the ScriptedScreens docs (docs/api/icons.md): gas / slot / prefab groups,
// with the prefab set split into the documented subgroups.
//
// Stored value format for the designer's `name` field:
//   - Catalog pick:  "<kind>:<Name>"  e.g. "gas:Oxygen", "slot:Helmet",
//                    "prefab:SteelIngot"  -> generator emits the enum token
//                    ss.ui.icons.<kind>.<Name>.
//   - Custom prefab: a raw string (anything without a "<kind>:" catalog prefix)
//                    -> generator emits icon_type = "prefab", name = "<raw>".
//
// This mirrors the two documented forms exactly, so no icon name is guessed.

export type IconKind = "gas" | "slot" | "prefab";

export interface IconEntry {
  /** Enum member name as used in ss.ui.icons.<kind>.<name>. */
  name: string;
  /** Documented alias shown in the picker (e.g. CO2 for CarbonDioxide). */
  alias?: string;
}

export interface IconGroup {
  /** Section label shown in the picker. */
  label: string;
  kind: IconKind;
  /** Optional subgroup label (prefab is split into Ingots/Ores/… in docs). */
  subgroup?: string;
  entries: IconEntry[];
}

const GAS: IconEntry[] = [
  { name: "Oxygen" },
  { name: "Nitrogen" },
  { name: "CarbonDioxide", alias: "CO2" },
  { name: "Methane", alias: "Volatiles" },
  { name: "Pollutant" },
  { name: "Water" },
  { name: "NitrousOxide", alias: "N2O" },
  { name: "LiquidNitrogen" },
  { name: "LiquidOxygen" },
  { name: "LiquidMethane", alias: "LiquidVolatiles" },
  { name: "Steam" },
  { name: "LiquidCarbonDioxide", alias: "LiquidCO2" },
  { name: "LiquidPollutant" },
  { name: "LiquidNitrousOxide" },
  { name: "Hydrogen", alias: "H2" },
  { name: "LiquidHydrogen" },
  { name: "PollutedWater" },
  { name: "Hydrazine" },
  { name: "LiquidHydrazine" },
  { name: "LiquidAlcohol", alias: "Ethanol" },
  { name: "Helium", alias: "He" },
  { name: "LiquidSodiumChloride", alias: "NaCl" },
  { name: "Silanol" },
  { name: "LiquidSilanol" },
  { name: "HydrochloricAcid", alias: "HCl" },
  { name: "LiquidHydrochloricAcid" },
  { name: "Ozone", alias: "O3" },
  { name: "LiquidOzone" },
];

const SLOT: IconEntry[] = [
  { name: "None" },
  { name: "Helmet" },
  { name: "Suit" },
  { name: "Back" },
  { name: "GasFilter" },
  { name: "GasCanister" },
  { name: "Motherboard" },
  { name: "Circuitboard" },
  { name: "DataDisk" },
  { name: "Organ" },
  { name: "Ore" },
  { name: "Plant" },
  { name: "Uniform" },
  { name: "Entity" },
  { name: "Battery" },
  { name: "Egg" },
  { name: "Belt" },
  { name: "Tool" },
  { name: "Appliance" },
  { name: "Ingot" },
  { name: "Torpedo" },
  { name: "Cartridge" },
  { name: "AccessCard" },
  { name: "Magazine" },
  { name: "Circuit" },
  { name: "Bottle" },
  { name: "ProgrammableChip", alias: "Chip" },
  { name: "Glasses" },
  { name: "CreditCard" },
  { name: "DirtCanister" },
  { name: "SensorProcessingUnit", alias: "SPU" },
  { name: "LiquidCanister" },
  { name: "LiquidBottle" },
  { name: "Wreckage" },
  { name: "SoundCartridge" },
  { name: "DrillHead" },
  { name: "ScanningHead" },
  { name: "Flare" },
  { name: "SuitMod" },
  { name: "Crate" },
  { name: "Portables" },
  { name: "RocketPayload" },
];

// Prefab curated set, split into the documented subgroups.
const PREFAB_SUBGROUPS: { subgroup: string; entries: IconEntry[] }[] = [
  {
    subgroup: "Ingots",
    entries: [
      { name: "IronIngot" }, { name: "SteelIngot" }, { name: "CopperIngot" },
      { name: "GoldIngot" }, { name: "SilverIngot" }, { name: "NickelIngot" },
      { name: "LeadIngot" }, { name: "SiliconIngot" }, { name: "CoalIngot" },
      { name: "ElectrumIngot" }, { name: "SolderIngot" }, { name: "ConstantanIngot" },
      { name: "InvarIngot" }, { name: "AstroloyIngot" }, { name: "HastelloyIngot" },
      { name: "WaspaloyIngot" }, { name: "InconelIngot" },
      { name: "StelliteIngot", alias: "SteliteIngot" },
    ],
  },
  {
    subgroup: "Ores",
    entries: [
      { name: "IronOre" }, { name: "CopperOre" }, { name: "GoldOre" },
      { name: "SilverOre" }, { name: "NickelOre" }, { name: "LeadOre" },
      { name: "SiliconOre" }, { name: "CoalOre" }, { name: "UraniumOre" },
      { name: "CobaltOre" },
    ],
  },
  {
    subgroup: "Ice",
    entries: [{ name: "IceOxite" }, { name: "IceVolatiles" }, { name: "IceNitrice" }],
  },
  {
    subgroup: "Tools",
    entries: [
      { name: "Wrench" }, { name: "Screwdriver" }, { name: "Crowbar" },
      { name: "Welder" }, { name: "AngleGrinder" }, { name: "Pickaxe" },
      { name: "Drill" }, { name: "DuctTape" }, { name: "Multitool" },
      { name: "Tablet" }, { name: "Labeller" },
    ],
  },
  {
    subgroup: "Components",
    entries: [
      { name: "Cable" }, { name: "CableCoil" }, { name: "Pipe" },
      { name: "SteelSheets" }, { name: "IronSheets" }, { name: "CopperSheets" },
      { name: "GoldSheets" }, { name: "SteelFrames" }, { name: "IronFrames" },
      { name: "CircuitBoard" }, { name: "IC" }, { name: "LuaChip" },
      { name: "Battery" }, { name: "BatteryLarge" }, { name: "GasCanister" },
      { name: "GasFilter" }, { name: "DataDisk" }, { name: "SensorLens" },
      { name: "Motor" },
    ],
  },
  {
    subgroup: "Food / Plants",
    entries: [
      { name: "Potato" }, { name: "Tomato" }, { name: "Pumpkin" },
      { name: "Corn" }, { name: "Wheat" }, { name: "Soybean" },
      { name: "Rice" }, { name: "Mushroom" }, { name: "CannedFood" },
    ],
  },
  {
    subgroup: "Equipment",
    entries: [
      { name: "Helmet" }, { name: "Suit" }, { name: "Jetpack" },
      { name: "MiningBelt" }, { name: "ToolBelt" }, { name: "Uniform" },
    ],
  },
  {
    subgroup: "Machines",
    entries: [
      { name: "ArcFurnace" }, { name: "Autolathe" }, { name: "ElectronicsPrinter" },
      { name: "HydraulicPipeBender" }, { name: "Furnace" }, { name: "SolarPanel" },
      { name: "BatterySmall" }, { name: "BatteryLargeStruct" }, { name: "AdvancedFurnace" },
      { name: "Computer" }, { name: "Console" }, { name: "Light" },
      { name: "Tank" }, { name: "GasMixer" }, { name: "PipeAnalyzer" },
      { name: "ActiveVent" }, { name: "PassiveVent" }, { name: "Filtration" },
    ],
  },
];

/** All picker groups in display order (gas, slot, then prefab subgroups). */
export const ICON_GROUPS: IconGroup[] = [
  { label: "Gas", kind: "gas", entries: GAS },
  { label: "Slot", kind: "slot", entries: SLOT },
  ...PREFAB_SUBGROUPS.map((g) => ({
    label: `Prefab · ${g.subgroup}`,
    kind: "prefab" as IconKind,
    subgroup: g.subgroup,
    entries: g.entries,
  })),
];

/** Set of valid "<kind>:<Name>" catalog keys for quick membership checks. */
const CATALOG_KEYS = new Set<string>();
for (const g of ICON_GROUPS) {
  for (const e of g.entries) CATALOG_KEYS.add(`${g.kind}:${e.name}`);
}

/** True if the value is a recognized catalog key ("gas:Oxygen" etc.). */
export function isCatalogValue(value: string): boolean {
  return CATALOG_KEYS.has(value);
}

/** Split a "<kind>:<Name>" value; null when it isn't a catalog reference. */
export function parseIconValue(
  value: string
): { kind: IconKind; name: string } | null {
  const idx = value.indexOf(":");
  if (idx === -1) return null;
  const kind = value.slice(0, idx);
  const name = value.slice(idx + 1);
  if ((kind === "gas" || kind === "slot" || kind === "prefab") && name) {
    return { kind, name };
  }
  return null;
}

/** Human-readable label for a stored icon value (for the picker input). */
export function iconValueLabel(value: string): string {
  const parsed = parseIconValue(value);
  if (!parsed) return value; // custom raw prefab name
  const kindLabel = parsed.kind[0].toUpperCase() + parsed.kind.slice(1);
  return `${kindLabel}: ${parsed.name}`;
}
