import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreProvider, useStore } from "./state/store";
import { DatasetLoader } from "./components/DatasetLoader";
import { AddDeviceModal } from "./components/AddDeviceModal";
import { DevicePanel } from "./components/DevicePanel";
import { ScreenPreview } from "./components/ScreenPreview";
import { StateIO } from "./components/StateIO";
import { DesignerView } from "./designer/DesignerView";
import { DesignerProvider } from "./designer/designerStore";
import { SyncBridge } from "./designer/SyncBridge";
import { CodeEditor, type EditorHandle } from "./components/CodeEditor";
import { findFunctionBodyLine } from "./designer/generateLua";
import { ScriptNavContext, type ScriptNav } from "./designer/scriptNav";
import { ResetButton } from "./components/ResetButton";
import { loadSampleDataset } from "./dataset/loadSampleDataset";
import { runScript, type RunHandle } from "./runtime/engine";
import type { DeviceInstance } from "./domain/device";
import {
  isFileWatchSupported,
  pickScriptFile,
  watchFile,
  type FileWatcher,
} from "./state/fileWatch";

type EditorTab = "script" | "screen" | "design";

function EditorPane() {
  const { state, dispatch, devicesRef, engineRef } = useStore();
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<EditorTab>("script");
  const handleRef = useRef<RunHandle | null>(null);
  const [watchName, setWatchName] = useState<string | null>(null);
  const watcherRef = useRef<FileWatcher | null>(null);
  // Refs so the file-watch callback (a stable closure) always sees current values.
  const runningRef = useRef(false);
  const runRef = useRef<(scriptText?: string) => void>(() => {});
  // The exact source the running script was started with, so switching to the
  // Screen tab can restart only when the code actually changed.
  const lastRunScriptRef = useRef<string | null>(null);
  // Editor navigation: the CodeEditor fills editorHandleRef on mount; a jump
  // requested while the editor is unmounted (off the Script tab) is queued in
  // pendingLineRef and applied on next mount.
  const editorHandleRef = useRef<EditorHandle | null>(null);
  const pendingLineRef = useRef<number | null>(null);

  const canRun = state.catalog !== null;

  // Script-navigation channel for the designer's "go to code" buttons: switch
  // to the Script tab and place the cursor inside the handler's function body.
  const goToHandler = useCallback(
    (functionName: string) => {
      const name = functionName.trim();
      if (!name) return;
      const line = findFunctionBodyLine(state.script, name);
      if (line == null) return;
      setTab("script");
      // If the editor is already mounted, jump now; otherwise queue for mount.
      if (editorHandleRef.current) {
        // Defer a tick so a tab switch that mounts the editor settles first.
        requestAnimationFrame(() => editorHandleRef.current?.goToLine(line));
      } else {
        pendingLineRef.current = line;
      }
    },
    [state.script]
  );
  const scriptNav = useMemo<ScriptNav>(() => ({ goToHandler }), [goToHandler]);

  function stop() {
    handleRef.current?.stop();
    handleRef.current = null;
    engineRef.current = null;
    setRunning(false);
    runningRef.current = false;
    lastRunScriptRef.current = null;
    dispatch({ type: "log", kind: "info", text: "Stopped." });
  }

  async function run(scriptText?: string) {
    if (!state.catalog) {
      dispatch({
        type: "log",
        kind: "error",
        text: "No dataset loaded — click \"Sample\" in the Devices panel, or load your own Stationpedia.json, then Run again.",
      });
      return;
    }
    const source = scriptText ?? state.script;
    lastRunScriptRef.current = source;
    handleRef.current?.stop();
    dispatch({ type: "clearConsole" });
    dispatch({ type: "setScene", scene: null });
    setRunning(true);
    runningRef.current = true;
    // Switch to the screen tab so UI scripts are visible immediately.
    setTab("screen");

    const patchDevice = (
      id: string,
      mutate: (d: DeviceInstance) => Partial<DeviceInstance>
    ) => {
      const current = devicesRef.current.find((d) => d.id === id);
      if (!current) return;
      dispatch({ type: "updateDevice", id, patch: mutate(current) });
    };

    try {
      const handle = await runScript(source, {
        catalog: state.catalog,
        getDevices: () => devicesRef.current,
        log: (kind, text) => dispatch({ type: "log", kind, text }),
        setLogicValue: (id, logicType, value) =>
          patchDevice(id, (d) => ({
            logicValues: { ...d.logicValues, [logicType]: value },
          })),
        setSlotValue: (id, slot, slotType, value) =>
          patchDevice(id, (d) => ({
            slotValues: {
              ...d.slotValues,
              [slot]: { ...(d.slotValues[slot] ?? {}), [slotType]: value },
            },
          })),
        setDeviceName: (id, name) => patchDevice(id, () => ({ name })),
        setMemoryValue: (id, addr, value) =>
          patchDevice(id, (d) => ({
            memory: { ...d.memory, [addr]: value },
          })),
        clearMemory: (id) => patchDevice(id, () => ({ memory: {} })),
        onCommit: (scene) => dispatch({ type: "setScene", scene }),
        screenSize: { w: state.screenSize.w, h: state.screenSize.h },
      });
      handleRef.current = handle;
      engineRef.current = handle;
    } catch (e) {
      dispatch({
        type: "log",
        kind: "error",
        text: `Failed to start: ${e instanceof Error ? e.message : String(e)}`,
      });
      setRunning(false);
      runningRef.current = false;
    }
  }

  // Keep refs current so the watcher callback uses the latest run() / running.
  runRef.current = run;
  runningRef.current = running;

  async function toggleWatch() {
    if (watcherRef.current) {
      watcherRef.current.stop();
      watcherRef.current = null;
      setWatchName(null);
      dispatch({ type: "log", kind: "info", text: "Stopped watching file." });
      return;
    }
    let handle;
    try {
      handle = await pickScriptFile();
    } catch (e) {
      dispatch({
        type: "log",
        kind: "error",
        text: `Could not open file picker: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
      return;
    }
    if (!handle) return; // user cancelled
    const watcher = watchFile(
      handle,
      (text) => {
        // Update the editor, and if running, restart with the fresh source.
        dispatch({ type: "setScript", script: text });
        dispatch({
          type: "log",
          kind: "info",
          text: `Reloaded ${handle.name}.`,
        });
        if (runningRef.current) runRef.current(text);
      },
      (msg) => dispatch({ type: "log", kind: "error", text: `Watch error: ${msg}` }),
      1000
    );
    watcherRef.current = watcher;
    setWatchName(watcher.name);
    dispatch({
      type: "log",
      kind: "info",
      text: `Watching ${watcher.name} — edits auto-reload.`,
    });
  }

  // Clean up the watcher when the pane unmounts.
  useEffect(() => {
    return () => watcherRef.current?.stop();
  }, []);

  // On startup, auto-load the bundled sample dataset if none is loaded, so Run
  // works out of the box. Runs once; a real dataset the user loads replaces it.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (autoLoadedRef.current) return;
    if (state.catalog !== null) return;
    autoLoadedRef.current = true;
    loadSampleDataset()
      .then(({ catalog, warnings }) => {
        dispatch({ type: "setCatalog", catalog, warnings });
        dispatch({
          type: "log",
          kind: "info",
          text: `Sample dataset loaded (${catalog.prefabs.length} prefabs). Load your own Stationpedia.json for the full catalog.`,
        });
      })
      .catch((e) => {
        dispatch({
          type: "log",
          kind: "info",
          text: `Could not auto-load sample dataset: ${
            e instanceof Error ? e.message : String(e)
          }. Load a dataset manually.`,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When switching to the Screen tab, restart the running script if its code
  // changed since it was last started — so edits (Script or Design) are shown.
  // If nothing is running, do nothing (don't auto-start).
  useEffect(() => {
    if (tab !== "screen") return;
    if (!runningRef.current) return;
    if (lastRunScriptRef.current === state.script) return;
    void run();
    // Only react to entering the Screen tab; run() reads the latest script.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  return (
    <DesignerProvider>
    <ScriptNavContext.Provider value={scriptNav}>
    <SyncBridge />
    <section className="pane pane--editor">
      <div className="pane-header">
        <div className="tabs">
          <button
            className={"tab" + (tab === "script" ? " tab--active" : "")}
            onClick={() => setTab("script")}
          >
            Script
          </button>
          <button
            className={"tab" + (tab === "screen" ? " tab--active" : "")}
            onClick={() => setTab("screen")}
          >
            Screen
          </button>
          <button
            className={"tab" + (tab === "design" ? " tab--active" : "")}
            onClick={() => setTab("design")}
          >
            Design
          </button>
        </div>
        <div className="toolbar">
          {tab !== "design" && (
            <>
              {isFileWatchSupported() ? (
                <button
                  onClick={toggleWatch}
                  className={watchName ? "watching" : ""}
                  title={
                    watchName
                      ? `Watching ${watchName} — click to stop`
                      : "Watch a script file and auto-reload on save"
                  }
                >
                  {watchName ? `Watching: ${watchName}` : "Watch file"}
                </button>
              ) : (
                <button
                  disabled
                  title="File watching needs a Chromium browser (Chrome/Edge)"
                >
                  Watch file
                </button>
              )}
              {running ? (
                <button onClick={stop}>Stop</button>
              ) : (
                <button
                  className="primary"
                  disabled={!canRun}
                  title={canRun ? "Run the script" : "Load a dataset first"}
                  onClick={() => run()}
                >
                  Run
                </button>
              )}
            </>
          )}
          {/* Global reset — available on every tab. */}
          <ResetButton />
        </div>
      </div>

      {tab === "script" && (
        <CodeEditor
          value={state.script}
          onChange={(script) => dispatch({ type: "setScript", script })}
          handleRef={editorHandleRef}
          pendingLineRef={pendingLineRef}
        />
      )}
      {tab === "screen" && <ScreenPreview />}
      {/* Kept mounted (hidden when inactive) so designer state survives tab
          switches and stays in sync with the Script tab via SyncBridge. */}
      <div style={{ display: tab === "design" ? "contents" : "none" }}>
        <DesignerView />
      </div>
    </section>
    </ScriptNavContext.Provider>
    </DesignerProvider>
  );
}

function ConsolePane() {
  const { state, dispatch } = useStore();
  return (
    <section className="pane pane--console">
      <div className="pane-header">
        <span>Console</span>
        <div className="toolbar">
          <button onClick={() => dispatch({ type: "clearConsole" })}>Clear</button>
        </div>
      </div>
      <div className="console">
        {state.console.length === 0 ? (
          <div className="console-line console-line--info">
            Load a dataset and add devices to begin.
          </div>
        ) : (
          state.console.map((line) => (
            <div key={line.id} className={`console-line console-line--${line.kind}`}>
              {line.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DevicesPane() {
  const { state, dispatch } = useStore();
  const [adding, setAdding] = useState(false);
  const canAdd = state.catalog !== null;

  return (
    <aside className="pane pane--devices">
      <div className="pane-header">
        <span>Devices</span>
        <div className="toolbar">
          <StateIO />
          <button
            className="primary"
            disabled={!canAdd}
            title={canAdd ? "Add a device" : "Load a dataset first"}
            onClick={() => setAdding(true)}
          >
            + Add
          </button>
        </div>
      </div>
      <DatasetLoader />

      {state.devices.length === 0 ? (
        <div className="empty-hint">
          {canAdd
            ? "No devices yet. Use + Add to place one."
            : "Load a dataset to add devices."}
        </div>
      ) : (
        <div className="device-list">
          {state.devices.map((d) => (
            <div
              key={d.id}
              className={
                "device-list__item" +
                (d.id === state.selectedDeviceId
                  ? " device-list__item--active"
                  : "")
              }
              onClick={() => dispatch({ type: "selectDevice", id: d.id })}
            >
              <div>
                <div>{d.name ? d.name : d.title}</div>
                <div className="device-list__meta">{d.title}</div>
              </div>
              <div className="device-list__pin">
                {d.pin !== null ? `d${d.pin}` : "net"}
              </div>
            </div>
          ))}
        </div>
      )}

      {state.selectedDeviceId && <DevicePanel />}

      {adding && <AddDeviceModal onClose={() => setAdding(false)} />}
    </aside>
  );
}

export function App() {
  return (
    <StoreProvider>
      <div className="app">
        <EditorPane />
        <ConsolePane />
        <DevicesPane />
      </div>
    </StoreProvider>
  );
}
