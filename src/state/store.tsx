// Central app state: catalog (loaded dataset), device instances, console log.
// Kept as a small context + reducer so all panes share one source of truth.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { Catalog } from "../domain/types";
import type { DeviceInstance } from "../domain/device";
import type { SceneSnapshot } from "../runtime/ssScene";
import type { DesignControl } from "../designer/designerModel";
import { mergeDesignerScript } from "../designer/generateLua";
import { loadSession, saveSession } from "./sessionPersist";

export interface ConsoleEntry {
  id: number;
  kind: "log" | "error" | "info";
  text: string;
}

/** Screen (display) size the simulated surface reports via ui:size(). */
export interface ScreenSize {
  w: number;
  h: number;
}

export interface AppState {
  catalog: Catalog | null;
  datasetWarnings: string[];
  devices: DeviceInstance[];
  /** Currently selected device id in the panel, or null. */
  selectedDeviceId: string | null;
  console: ConsoleEntry[];
  script: string;
  /** Latest ScriptedScreens scene emitted by ui:commit(), or null. */
  scene: SceneSnapshot | null;
  /** Configurable display size reported by ui:size() and used by the preview. */
  screenSize: ScreenSize;
}

type Action =
  | { type: "setCatalog"; catalog: Catalog; warnings: string[] }
  | { type: "addDevice"; device: DeviceInstance }
  | { type: "removeDevice"; id: string }
  | { type: "updateDevice"; id: string; patch: Partial<DeviceInstance> }
  | { type: "selectDevice"; id: string | null }
  | { type: "setScript"; script: string }
  | { type: "log"; kind: ConsoleEntry["kind"]; text: string }
  | { type: "clearConsole" }
  | { type: "setScene"; scene: SceneSnapshot | null }
  | {
      type: "loadState";
      script: string;
      devices: DeviceInstance[];
      screenSize: ScreenSize;
    }
  | { type: "setScreenSize"; size: ScreenSize };

let consoleSeq = 0;

// The empty-project starter. Built through the real designer generator so the
// designer block is parse-consistent with what the Design tab produces: a
// single centered label, plus a user-code tick(dt) below the designer region.
// Board is the default 480x272; a 200x30 label centered -> x=140, y=121.
const STARTER_CONTROL: DesignControl = {
  id: "label1",
  type: "label",
  rect: { unit: "px", x: 140, y: 121, w: 200, h: 30 },
  props: { text: "Hello, Stationeer" },
  style: { align: "center", color: "#E2E8F0", font_size: 16 },
  parentId: null,
  z: 0,
  order: 1,
  handlers: { click: "", change: "", toggle: "" },
};

const STARTER_USER_CODE = `-- Your code lives below the designer region and is never
-- overwritten by the Design tab. Define tick(dt) to update the UI each tick.

function tick(dt)
  -- Example: read a value and update a label
  -- local ui = ss.ui.surface("main")
  -- ui:get("label1"):set_props({ text = tostring(ic.read(0, ic.enums.LogicType.On)) })
  -- ui:commit()
end
`;

const DEFAULT_SCRIPT = mergeDesignerScript(STARTER_USER_CODE, [STARTER_CONTROL]);

const initialState: AppState = {
  catalog: null,
  datasetWarnings: [],
  devices: [],
  selectedDeviceId: null,
  console: [],
  script: DEFAULT_SCRIPT,
  scene: null,
  screenSize: { w: 480, h: 272 },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "setCatalog":
      return { ...state, catalog: action.catalog, datasetWarnings: action.warnings };
    case "addDevice":
      return {
        ...state,
        devices: [...state.devices, action.device],
        selectedDeviceId: action.device.id,
      };
    case "removeDevice":
      return {
        ...state,
        devices: state.devices.filter((d) => d.id !== action.id),
        selectedDeviceId:
          state.selectedDeviceId === action.id ? null : state.selectedDeviceId,
      };
    case "updateDevice":
      return {
        ...state,
        devices: state.devices.map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d
        ),
      };
    case "selectDevice":
      return { ...state, selectedDeviceId: action.id };
    case "setScript":
      return { ...state, script: action.script };
    case "log":
      return {
        ...state,
        console: [
          ...state.console,
          { id: ++consoleSeq, kind: action.kind, text: action.text },
        ].slice(-500),
      };
    case "clearConsole":
      return { ...state, console: [] };
    case "setScene":
      return { ...state, scene: action.scene };
    case "setScreenSize":
      return { ...state, screenSize: action.size };
    case "loadState":
      return {
        ...state,
        script: action.script,
        devices: action.devices,
        selectedDeviceId: action.devices[0]?.id ?? null,
        screenSize: action.screenSize,
        scene: null,
      };
    default:
      return state;
  }
}

/** Minimal surface the UI preview needs from a running engine. */
export interface UiEventDispatcher {
  dispatchUiEvent: (
    elementId: string,
    kind: "click" | "change" | "toggle",
    value?: string
  ) => void;
}

interface StoreValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  /**
   * Always-current view of devices, for the Lua engine to read without stale
   * closures. Kept in sync with state.devices on every render.
   */
  devicesRef: MutableRefObject<DeviceInstance[]>;
  /** The running engine's event dispatcher, or null when not running. */
  engineRef: MutableRefObject<UiEventDispatcher | null>;
}

const StoreContext = createContext<StoreValue | null>(null);

/** Lazy initializer: merge any persisted session over the defaults. */
function initState(): AppState {
  const saved = loadSession();
  if (!saved) return initialState;
  return {
    ...initialState,
    script: saved.script,
    devices: saved.devices,
    screenSize: saved.screenSize,
    // Select the first restored device so the panel isn't empty.
    selectedDeviceId: saved.devices[0]?.id ?? null,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const devicesRef = useRef<DeviceInstance[]>(state.devices);
  const engineRef = useRef<UiEventDispatcher | null>(null);
  useEffect(() => {
    devicesRef.current = state.devices;
  }, [state.devices]);

  // Persist the user-authored slice to localStorage, debounced so rapid edits
  // (typing in the editor, dragging in the designer) don't thrash storage.
  useEffect(() => {
    const t = setTimeout(() => {
      saveSession({
        script: state.script,
        devices: state.devices,
        screenSize: state.screenSize,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [state.script, state.devices, state.screenSize]);

  const value = useMemo(
    () => ({ state, dispatch, devicesRef, engineRef }),
    [state]
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
