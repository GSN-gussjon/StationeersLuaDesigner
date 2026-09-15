// Save the current simulator state (script + devices) to a JSON file, and
// import it back. Sits in the Devices pane toolbar.

import { useRef } from "react";
import { useStore } from "../state/store";
import {
  downloadJson,
  parseState,
  serializeState,
} from "../state/persistState";

export function StateIO() {
  const { state, dispatch } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);

  function save() {
    const text = serializeState(state.script, state.devices, state.screenSize);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadJson(`sim-state-${stamp}.json`, text);
    dispatch({
      type: "log",
      kind: "info",
      text: `Saved ${state.devices.length} device(s) + script.`,
    });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-fires change.
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const knownHashes = state.catalog
        ? new Set(state.catalog.prefabs.map((p) => p.prefabHash))
        : undefined;
      const { script, devices, screenSize, warnings } = parseState(
        text,
        knownHashes
      );
      dispatch({ type: "loadState", script, devices, screenSize });
      dispatch({
        type: "log",
        kind: "info",
        text: `Imported ${devices.length} device(s) + script.`,
      });
      warnings.forEach((w) => dispatch({ type: "log", kind: "info", text: w }));
    } catch (err) {
      dispatch({
        type: "log",
        kind: "error",
        text: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return (
    <div className="state-io">
      <button onClick={save} title="Save script + devices to a file">
        Save
      </button>
      <button onClick={() => fileRef.current?.click()} title="Import a saved state file">
        Import
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={onFile}
      />
    </div>
  );
}
