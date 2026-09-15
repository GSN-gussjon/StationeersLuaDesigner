// "Add Device" modal, modeled on ic10.dev: pick a prefab (searchable), give it a
// name (as with the Labeller), assign an IC pin (or leave empty), optional id.

import { useMemo, useState } from "react";
import { useStore } from "../state/store";
import { createDevice } from "../domain/network";
import { IC_PINS } from "../domain/device";
import { SearchSelect, type SearchOption } from "./SearchSelect";

interface Props {
  onClose: () => void;
}

export function AddDeviceModal({ onClose }: Props) {
  const { state, dispatch } = useStore();
  const catalog = state.catalog;

  const [prefabName, setPrefabName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState<string>(""); // "" = no pin
  const [refId, setRefId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const prefabOptions: SearchOption[] = useMemo(() => {
    if (!catalog) return [];
    return catalog.prefabs.map((p) => ({
      value: p.prefabName,
      label: p.title,
      hint: p.prefabName,
    }));
  }, [catalog]);

  // Pins already taken, so we can disable them in the selector.
  const takenPins = useMemo(
    () => new Set(state.devices.map((d) => d.pin).filter((p) => p !== null)),
    [state.devices]
  );

  function submit() {
    setError(null);
    if (!catalog) {
      setError("Load a dataset first.");
      return;
    }
    if (!prefabName) {
      setError("Select a device prefab.");
      return;
    }
    const prefab = catalog.byName.get(prefabName);
    if (!prefab) {
      setError("Prefab not found in catalog.");
      return;
    }
    let referenceId: number | undefined;
    if (refId.trim() !== "") {
      const parsed = Number(refId.trim());
      if (!Number.isFinite(parsed)) {
        setError("Device id must be a number.");
        return;
      }
      referenceId = parsed;
    }
    const parsedPin = pin === "" ? null : Number(pin);
    const device = createDevice({
      prefab,
      name: name.trim(),
      pin: parsedPin,
      referenceId,
    });
    dispatch({ type: "addDevice", device });
    dispatch({
      type: "log",
      kind: "info",
      text: `Added ${prefab.title}${name.trim() ? ` "${name.trim()}"` : ""}${
        parsedPin !== null ? ` on d${parsedPin}` : ""
      }.`,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Add Device</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal__subtitle">Add new device to environment</p>

        <div className="modal__row">
          <label className="field">
            <span className="field__label">Device hash</span>
            <SearchSelect
              options={prefabOptions}
              value={prefabName}
              placeholder="Select prefab…"
              onChange={setPrefabName}
            />
            <span className="field__help">
              Select your device PrefabName or PrefabHash.
            </span>
          </label>

          <label className="field">
            <span className="field__label">Device Name</span>
            <input
              className="text-input"
              value={name}
              placeholder="e.g. bench"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="field__help">
              The device name as set with the Labeller.
            </span>
          </label>

          <label className="field">
            <span className="field__label">IC Pin</span>
            <select
              className="text-input"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            >
              <option value="">— (network only)</option>
              {IC_PINS.map((p) => (
                <option key={p} value={p} disabled={takenPins.has(p)}>
                  d{p}
                  {takenPins.has(p) ? " (taken)" : ""}
                </option>
              ))}
            </select>
            <span className="field__help">
              Pin the device is assigned to, or leave empty.
            </span>
          </label>
        </div>

        <label className="field field--wide">
          <span className="field__label">Device id</span>
          <input
            className="text-input"
            value={refId}
            placeholder="Enter device id or leave empty"
            onChange={(e) => setRefId(e.target.value)}
          />
          <span className="field__help">
            Enter a ReferenceId or leave it empty to auto-generate.
          </span>
        </label>

        {error && <div className="modal__error">{error}</div>}

        <div className="modal__actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit}>
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
