// Device property panel, modeled on the ic10.dev device inspector:
// header (icon, title, prefab name, label), tabs (Props / Slots / Stack /
// Reagents), and per-tab editors. Props shows ReferenceId + PrefabHash (read
// only), Name, and the logic properties the user has added, plus an add-row
// with a searchable LogicType dropdown limited to what the prefab supports.

import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import type { DeviceInstance } from "../domain/device";
import type { PrefabDef } from "../domain/types";
import { SearchSelect, type SearchOption } from "./SearchSelect";

type Tab = "props" | "slots" | "stack" | "reagents";

export function DevicePanel() {
  const { state } = useStore();
  const device = state.devices.find((d) => d.id === state.selectedDeviceId);
  const prefab = device
    ? state.catalog?.byHash.get(device.prefabHash) ?? null
    : null;

  const [tab, setTab] = useState<Tab>("props");

  if (!device) {
    return (
      <div className="empty-hint">Select a device to view its properties.</div>
    );
  }

  return (
    <div className="device-panel">
      <div className="device-panel__header">
        <div className="device-panel__title">{device.title}</div>
        <div className="device-panel__prefab">{device.prefabName}</div>
        {device.name && (
          <div className="device-panel__label">{device.name}</div>
        )}
      </div>

      <div className="device-panel__tabs">
        {(["props", "slots", "stack", "reagents"] as Tab[]).map((t) => (
          <button
            key={t}
            className={
              "device-panel__tab" +
              (tab === t ? " device-panel__tab--active" : "")
            }
            onClick={() => setTab(t)}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="device-panel__body">
        {tab === "props" && <PropsTab device={device} prefab={prefab} />}
        {tab === "slots" && <SlotsTab device={device} prefab={prefab} />}
        {tab === "stack" && <StackTab device={device} />}
        {tab === "reagents" && <ReagentsTab device={device} />}
      </div>
    </div>
  );
}

function PropsTab({
  device,
  prefab,
}: {
  device: DeviceInstance;
  prefab: PrefabDef | null;
}) {
  const { dispatch } = useStore();
  const [addType, setAddType] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("0");

  // Logic types available on this prefab that are writable/readable and not
  // already added to the instance.
  const availableTypes: SearchOption[] = useMemo(() => {
    if (!prefab) return [];
    const added = new Set(Object.keys(device.logicValues));
    return prefab.logic
      .filter((l) => !added.has(l.name))
      .map((l) => ({ value: l.name, label: l.name, hint: l.access }));
  }, [prefab, device.logicValues]);

  function setValue(name: string, raw: string) {
    const num = Number(raw);
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: {
        logicValues: {
          ...device.logicValues,
          [name]: Number.isFinite(num) ? num : 0,
        },
      },
    });
  }

  function removeValue(name: string) {
    const next = { ...device.logicValues };
    delete next[name];
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: { logicValues: next },
    });
  }

  function addProperty() {
    if (!addType) return;
    setValue(addType, addValue);
    setAddType(null);
    setAddValue("0");
  }

  const addedEntries = Object.entries(device.logicValues);

  return (
    <div className="props">
      <div className="props__grid">
        <PropRow label="ReferenceId" value={String(device.referenceId)} readOnly />
        <PropRow label="PrefabHash" value={String(device.prefabHash)} readOnly />
        <PropRow
          label="Name"
          value={device.name}
          onChange={(v) =>
            dispatch({
              type: "updateDevice",
              id: device.id,
              patch: { name: v },
            })
          }
        />
        {addedEntries.map(([name, value]) => (
          <PropRow
            key={name}
            label={name}
            value={String(value)}
            numeric
            onChange={(v) => setValue(name, v)}
            onRemove={() => removeValue(name)}
          />
        ))}
      </div>

      <div className="props__add">
        <SearchSelect
          options={availableTypes}
          value={addType}
          placeholder={
            availableTypes.length ? "Add LogicType…" : "No more logic types"
          }
          onChange={setAddType}
        />
        <input
          className="text-input props__add-value"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
        />
        <button
          className="primary"
          disabled={!addType}
          onClick={addProperty}
          title="Add property"
        >
          +
        </button>
      </div>

      <button
        className="danger props__remove"
        onClick={() => dispatch({ type: "removeDevice", id: device.id })}
      >
        Remove device
      </button>
    </div>
  );
}

function SlotsTab({
  device,
  prefab,
}: {
  device: DeviceInstance;
  prefab: PrefabDef | null;
}) {
  if (!prefab || prefab.slots.length === 0) {
    return <div className="empty-hint">This prefab has no slots.</div>;
  }
  return (
    <div className="slots">
      {prefab.slots.map((s) => (
        <SlotRow key={s.index} device={device} prefab={prefab} slotIndex={s.index} slotName={s.typeName} />
      ))}
    </div>
  );
}

/** One slot: its label + editable LogicSlotType values, mirroring PropsTab. */
function SlotRow({
  device,
  prefab,
  slotIndex,
  slotName,
}: {
  device: DeviceInstance;
  prefab: PrefabDef;
  slotIndex: number;
  slotName: string | null;
}) {
  const { dispatch } = useStore();
  const [addType, setAddType] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("0");

  const values = device.slotValues[slotIndex] ?? {};

  const available: SearchOption[] = useMemo(() => {
    const added = new Set(Object.keys(values));
    return prefab.slotLogic
      .filter((l) => !added.has(l.name))
      .map((l) => ({ value: l.name, label: l.name, hint: l.access }));
  }, [prefab.slotLogic, values]);

  function writeSlot(name: string, raw: string) {
    const num = Number(raw);
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: {
        slotValues: {
          ...device.slotValues,
          [slotIndex]: {
            ...(device.slotValues[slotIndex] ?? {}),
            [name]: Number.isFinite(num) ? num : 0,
          },
        },
      },
    });
  }

  function removeSlotValue(name: string) {
    const next = { ...(device.slotValues[slotIndex] ?? {}) };
    delete next[name];
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: {
        slotValues: { ...device.slotValues, [slotIndex]: next },
      },
    });
  }

  function add() {
    if (!addType) return;
    writeSlot(addType, addValue);
    setAddType(null);
    setAddValue("0");
  }

  const entries = Object.entries(values);

  return (
    <div className="slot-block">
      <div className="slot-block__head">
        <span className="slots__idx">#{slotIndex}</span>
        <span className="slots__name">{slotName ?? "Slot"}</span>
      </div>

      {entries.length > 0 && (
        <div className="props__grid">
          {entries.map(([name, value]) => (
            <PropRow
              key={name}
              label={name}
              value={String(value)}
              numeric
              onChange={(v) => writeSlot(name, v)}
              onRemove={() => removeSlotValue(name)}
            />
          ))}
        </div>
      )}

      {prefab.slotLogic.length > 0 ? (
        <div className="props__add">
          <SearchSelect
            options={available}
            value={addType}
            placeholder={
              available.length ? "Add LogicSlotType…" : "All added"
            }
            onChange={setAddType}
          />
          <input
            className="text-input props__add-value"
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
          />
          <button className="primary" disabled={!addType} onClick={add} title="Add slot value">
            +
          </button>
        </div>
      ) : (
        <div className="field__help">
          This prefab exposes no slot logic types.
        </div>
      )}
    </div>
  );
}

/** Stack / device-memory tab: edit the addressable memory (mem_get/mem_put). */
function StackTab({ device }: { device: DeviceInstance }) {
  const { dispatch } = useStore();
  const [addAddr, setAddAddr] = useState("");
  const [addValue, setAddValue] = useState("0");

  const entries = Object.entries(device.memory)
    .map(([a, v]) => [Number(a), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);

  function setMem(addr: number, raw: string) {
    const num = Number(raw);
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: {
        memory: { ...device.memory, [addr]: Number.isFinite(num) ? num : 0 },
      },
    });
  }

  function removeMem(addr: number) {
    const next = { ...device.memory };
    delete next[addr];
    dispatch({ type: "updateDevice", id: device.id, patch: { memory: next } });
  }

  function add() {
    const addr = Number(addAddr);
    if (!Number.isInteger(addr) || addr < 0 || addr > 511) return;
    setMem(addr, addValue);
    setAddAddr("");
    setAddValue("0");
  }

  return (
    <div className="props">
      {entries.length === 0 ? (
        <div className="field__help" style={{ marginBottom: 8 }}>
          No memory set. Devices with memory (e.g. Logic Sorter, Memory chips)
          are read/written via mem_get / mem_put at addresses 0–511.
        </div>
      ) : (
        <div className="props__grid">
          {entries.map(([addr, value]) => (
            <PropRow
              key={addr}
              label={`[${addr}]`}
              value={String(value)}
              numeric
              onChange={(v) => setMem(addr, v)}
              onRemove={() => removeMem(addr)}
            />
          ))}
        </div>
      )}

      <div className="props__add props__add--stack">
        <input
          className="text-input"
          placeholder="addr 0–511"
          inputMode="numeric"
          value={addAddr}
          onChange={(e) => setAddAddr(e.target.value)}
        />
        <input
          className="text-input props__add-value"
          placeholder="value"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
        />
        <button
          className="primary"
          disabled={addAddr.trim() === ""}
          onClick={add}
          title="Set memory address"
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Reagents tab: edit reagent contents (ic.read_reagent / ic.rmap). */
function ReagentsTab({ device }: { device: DeviceInstance }) {
  const { state, dispatch } = useStore();
  const catalog = state.catalog;
  const [addHash, setAddHash] = useState<string | null>(null);
  const [addValue, setAddValue] = useState("0");

  const reagentOptions: SearchOption[] = useMemo(() => {
    if (!catalog) return [];
    const added = new Set(Object.keys(device.reagents));
    return catalog.reagents
      .filter((r) => !added.has(String(r.hash)))
      .map((r) => ({
        value: String(r.hash),
        label: r.name,
        hint: r.unit ?? undefined,
      }));
  }, [catalog, device.reagents]);

  const nameForHash = (hash: number): string =>
    catalog?.reagentByHash.get(hash)?.name ?? String(hash);

  function setReagent(hash: number, raw: string) {
    const num = Number(raw);
    dispatch({
      type: "updateDevice",
      id: device.id,
      patch: {
        reagents: {
          ...device.reagents,
          [hash]: Number.isFinite(num) ? num : 0,
        },
      },
    });
  }

  function removeReagent(hash: number) {
    const next = { ...device.reagents };
    delete next[hash];
    dispatch({ type: "updateDevice", id: device.id, patch: { reagents: next } });
  }

  function add() {
    if (!addHash) return;
    setReagent(Number(addHash), addValue);
    setAddHash(null);
    setAddValue("0");
  }

  const entries = Object.entries(device.reagents).map(
    ([h, v]) => [Number(h), v] as [number, number]
  );

  if (!catalog) {
    return <div className="empty-hint">Load a dataset first.</div>;
  }

  return (
    <div className="props">
      {entries.length === 0 ? (
        <div className="field__help" style={{ marginBottom: 8 }}>
          No reagents. Add one, then read it in-script with
          ic.read_reagent(dev, mode, hash).
        </div>
      ) : (
        <div className="props__grid">
          {entries.map(([hash, value]) => (
            <PropRow
              key={hash}
              label={nameForHash(hash)}
              value={String(value)}
              numeric
              onChange={(v) => setReagent(hash, v)}
              onRemove={() => removeReagent(hash)}
            />
          ))}
        </div>
      )}

      <div className="props__add">
        <SearchSelect
          options={reagentOptions}
          value={addHash}
          placeholder={reagentOptions.length ? "Add reagent…" : "No reagents in dataset"}
          onChange={setAddHash}
        />
        <input
          className="text-input props__add-value"
          value={addValue}
          onChange={(e) => setAddValue(e.target.value)}
        />
        <button className="primary" disabled={!addHash} onClick={add} title="Add reagent">
          +
        </button>
      </div>
    </div>
  );
}

interface PropRowProps {
  label: string;
  value: string;
  readOnly?: boolean;
  numeric?: boolean;
  onChange?: (v: string) => void;
  onRemove?: () => void;
}

function PropRow({
  label,
  value,
  readOnly,
  numeric,
  onChange,
  onRemove,
}: PropRowProps) {
  return (
    <div className="prop-row">
      <span className="prop-row__label">{label}</span>
      <input
        className={"prop-row__input" + (readOnly ? " prop-row__input--ro" : "")}
        value={value}
        readOnly={readOnly}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {onRemove ? (
        <button className="prop-row__remove" onClick={onRemove} title="Remove">
          −
        </button>
      ) : (
        <span className="prop-row__spacer" />
      )}
    </div>
  );
}
