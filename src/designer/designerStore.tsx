// Designer state: the control tree, current selection, board size, and grid
// settings, plus a reducer with the editing actions the canvas and properties
// panel dispatch.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Rect } from "../runtime/ssScene";
import {
  autoHandlerName,
  bumpIdSeqPast,
  emptyHandlers,
  nextControlId,
  nextOrder,
  type DesignControl,
  type EventKind,
  type HandlerMap,
} from "./designerModel";
import {
  WIDGET_BY_TYPE,
  defaultProps,
  defaultStyle,
} from "./widgetSchema";

export interface DesignerState {
  controls: DesignControl[];
  selectedId: string | null;
  board: { w: number; h: number };
  grid: { enabled: boolean; size: number };
}

type Action =
  | {
      type: "add";
      widgetType: string;
      x: number;
      y: number;
      parentId: string | null;
    }
  | { type: "select"; id: string | null }
  | { type: "rename"; id: string; newId: string }
  | { type: "update"; id: string; patch: Partial<DesignControl> }
  | { type: "setRect"; id: string; rect: Partial<Rect> }
  | { type: "reparent"; id: string; parentId: string | null; rect: Rect }
  | { type: "delete"; id: string }
  | { type: "setBoard"; w: number; h: number }
  | { type: "setGrid"; enabled?: boolean; size?: number }
  | { type: "load"; controls: DesignControl[] };

const initialState: DesignerState = {
  controls: [],
  selectedId: null,
  board: { w: 480, h: 272 },
  grid: { enabled: true, size: 8 },
};

function reducer(state: DesignerState, action: Action): DesignerState {
  switch (action.type) {
    case "add": {
      const def = WIDGET_BY_TYPE.get(action.widgetType);
      if (!def) return state;
      const id = nextControlId(action.widgetType);
      const control: DesignControl = {
        id,
        type: action.widgetType,
        rect: {
          unit: "px",
          x: Math.round(action.x),
          y: Math.round(action.y),
          w: def.defaultRect.w,
          h: def.defaultRect.h,
        },
        props: defaultProps(def),
        style: defaultStyle(def),
        parentId: action.parentId,
        z: 0,
        order: nextOrder(),
        handlers: emptyHandlers(),
        // Auto-layout containers get sensible starting options.
        ...(def.defaultLayout
          ? {
              layout: def.defaultLayout,
              layoutOpts:
                def.defaultLayout === "grid"
                  ? { cols: 2, gap: 4, padding: 8 }
                  : { direction: "row", gap: 4, padding: 8, align: "stretch", justify: "start" },
            }
          : {}),
      };
      return { ...state, controls: [...state.controls, control], selectedId: id };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "rename": {
      const { id: oldId, newId } = action;
      if (newId === oldId) return state;
      // Reject empty or colliding ids (validated in the UI too, but guard here).
      if (newId.trim() === "") return state;
      if (state.controls.some((c) => c.id === newId)) return state;

      const renamed = state.controls.map((c) => {
        if (c.id === oldId) {
          // Update handler names that were auto-derived from the old id; leave
          // user-typed names untouched (WinForms-style rename behavior).
          const handlers = { ...c.handlers } as HandlerMap;
          (["click", "change", "toggle"] as EventKind[]).forEach((ev) => {
            if (handlers[ev] === autoHandlerName(oldId, ev)) {
              handlers[ev] = autoHandlerName(newId, ev);
            }
          });
          return { ...c, id: newId, handlers };
        }
        // Re-point children whose parent was the renamed control.
        if (c.parentId === oldId) return { ...c, parentId: newId };
        return c;
      });

      return {
        ...state,
        controls: renamed,
        selectedId: state.selectedId === oldId ? newId : state.selectedId,
      };
    }
    case "update":
      return {
        ...state,
        controls: state.controls.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c
        ),
      };
    case "setRect":
      return {
        ...state,
        controls: state.controls.map((c) =>
          c.id === action.id ? { ...c, rect: { ...c.rect, ...action.rect } } : c
        ),
      };
    case "reparent":
      return {
        ...state,
        controls: state.controls.map((c) =>
          c.id === action.id
            ? { ...c, parentId: action.parentId, rect: action.rect }
            : c
        ),
      };
    case "delete": {
      // Remove the control and any descendants.
      const toRemove = new Set<string>([action.id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const c of state.controls) {
          if (c.parentId && toRemove.has(c.parentId) && !toRemove.has(c.id)) {
            toRemove.add(c.id);
            changed = true;
          }
        }
      }
      return {
        ...state,
        controls: state.controls.filter((c) => !toRemove.has(c.id)),
        selectedId:
          state.selectedId && toRemove.has(state.selectedId)
            ? null
            : state.selectedId,
      };
    }
    case "setBoard":
      return { ...state, board: { w: action.w, h: action.h } };
    case "setGrid":
      return {
        ...state,
        grid: {
          enabled: action.enabled ?? state.grid.enabled,
          size: action.size ?? state.grid.size,
        },
      };
    case "load":
      bumpIdSeqPast(action.controls);
      return { ...state, controls: action.controls, selectedId: null };
    default:
      return state;
  }
}

interface DesignerValue {
  state: DesignerState;
  dispatch: React.Dispatch<Action>;
}

const DesignerContext = createContext<DesignerValue | null>(null);

// Persist only board + grid settings (controls are restored from the script's
// designer block via SyncBridge, so they don't need separate persistence).
const PREFS_KEY = "stationeers-sim-designer-prefs";

function loadPrefs(): Pick<DesignerState, "board" | "grid"> | null {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (
      p &&
      p.board &&
      typeof p.board.w === "number" &&
      typeof p.board.h === "number" &&
      p.grid &&
      typeof p.grid.size === "number"
    ) {
      return { board: p.board, grid: p.grid };
    }
  } catch {
    // ignore
  }
  return null;
}

export function DesignerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, (init) => {
    const prefs = loadPrefs();
    return prefs ? { ...init, ...prefs } : init;
  });

  // Persist board + grid on change (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          PREFS_KEY,
          JSON.stringify({ board: state.board, grid: state.grid })
        );
      } catch {
        // ignore quota/security errors
      }
    }, 300);
    return () => clearTimeout(t);
  }, [state.board, state.grid]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return (
    <DesignerContext.Provider value={value}>{children}</DesignerContext.Provider>
  );
}

export function useDesigner(): DesignerValue {
  const ctx = useContext(DesignerContext);
  if (!ctx) throw new Error("useDesigner must be used within DesignerProvider");
  return ctx;
}
