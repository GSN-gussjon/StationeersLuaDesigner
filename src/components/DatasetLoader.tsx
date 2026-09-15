// Lets the user upload Stationpedia.json (+ optional Enums.json) exported by the
// StationeersStationpediaExtractor mod, and loads them into the catalog.

import { useRef, useState } from "react";
import { parseCatalog } from "../dataset/parseStationpedia";
import { loadSampleDataset } from "../dataset/loadSampleDataset";
import { useStore } from "../state/store";

export function DatasetLoader() {
  const { state, dispatch } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stationpediaRef = useRef<File | null>(null);
  const enumsRef = useRef<File | null>(null);
  const [names, setNames] = useState<{ pedia?: string; enums?: string }>({});

  async function tryLoad() {
    const pediaFile = stationpediaRef.current;
    if (!pediaFile) {
      setError("Select Stationpedia.json first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const pediaText = await pediaFile.text();
      const enumsText = enumsRef.current ? await enumsRef.current.text() : null;
      const { catalog, warnings } = parseCatalog(pediaText, enumsText);
      dispatch({ type: "setCatalog", catalog, warnings });
      dispatch({
        type: "log",
        kind: "info",
        text: `Loaded ${catalog.prefabs.length} prefabs, ${Object.keys(catalog.enums.logicType).length} logic types.`,
      });
      warnings.forEach((w) => dispatch({ type: "log", kind: "info", text: w }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Failed to parse: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadSample() {
    setBusy(true);
    setError(null);
    try {
      const { catalog, warnings } = await loadSampleDataset();
      dispatch({ type: "setCatalog", catalog, warnings });
      dispatch({
        type: "log",
        kind: "info",
        text: `Loaded sample dataset: ${catalog.prefabs.length} prefabs. Replace with your own Stationpedia.json for the full catalog.`,
      });
    } catch (e) {
      setError(`Failed to load sample: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  const loaded = state.catalog !== null;

  return (
    <div style={{ padding: "12px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Stationpedia.json {names.pedia ? `— ${names.pedia}` : ""}
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: "block", marginTop: 4, fontSize: 12 }}
            onChange={(e) => {
              stationpediaRef.current = e.target.files?.[0] ?? null;
              setNames((n) => ({ ...n, pedia: e.target.files?.[0]?.name }));
            }}
          />
        </label>
        <label style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Enums.json (optional) {names.enums ? `— ${names.enums}` : ""}
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: "block", marginTop: 4, fontSize: 12 }}
            onChange={(e) => {
              enumsRef.current = e.target.files?.[0] ?? null;
              setNames((n) => ({ ...n, enums: e.target.files?.[0]?.name }));
            }}
          />
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="primary" onClick={tryLoad} disabled={busy} style={{ flex: 1 }}>
            {busy ? "Loading…" : loaded ? "Reload dataset" : "Load dataset"}
          </button>
          <button onClick={loadSample} disabled={busy} title="Load bundled sample data">
            Sample
          </button>
        </div>
        {error && (
          <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div>
        )}
        {loaded && (
          <div style={{ color: "var(--accent)", fontSize: 12 }}>
            {state.catalog!.prefabs.length} prefabs loaded.
          </div>
        )}
      </div>
    </div>
  );
}
