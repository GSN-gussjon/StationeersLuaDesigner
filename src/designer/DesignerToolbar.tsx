// Designer toolbar: board size, grid toggle, Clear, and Save .lua. The layout
// is auto-synced into the Script tab (no manual "send"), so those actions were
// removed — the Design and Script tabs are two views of one script.

import { useDesigner } from "./designerStore";
import { fullScript } from "./generateLua";
import { downloadJson } from "../state/persistState";
import { useStore } from "../state/store";

export function DesignerToolbar() {
  const { state, dispatch } = useDesigner();
  const { state: app } = useStore();

  function save() {
    // Save the full script (designer block + user code + handler stubs), so the
    // downloaded file matches exactly what runs.
    const text = fullScript(app.script, state.controls);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    // downloadJson writes arbitrary text as a blob.
    downloadJson(`layout-${stamp}.lua`, text);
  }

  function clearBoard() {
    if (state.controls.length === 0) return;
    const ok = window.confirm(
      `Remove all ${state.controls.length} control(s) from the board?`
    );
    if (ok) dispatch({ type: "load", controls: [] });
  }

  return (
    <div className="designer-toolbar">
      <div className="designer-toolbar__group">
        <label className="designer-toolbar__lbl">Board</label>
        <input
          className="text-input designer-toolbar__num"
          type="number"
          value={state.board.w}
          onChange={(e) =>
            dispatch({
              type: "setBoard",
              w: Math.max(16, Number(e.target.value) || 0),
              h: state.board.h,
            })
          }
        />
        <span className="designer-toolbar__x">×</span>
        <input
          className="text-input designer-toolbar__num"
          type="number"
          value={state.board.h}
          onChange={(e) =>
            dispatch({
              type: "setBoard",
              w: state.board.w,
              h: Math.max(16, Number(e.target.value) || 0),
            })
          }
        />
      </div>

      <label className="designer-toolbar__check">
        <input
          type="checkbox"
          checked={state.grid.enabled}
          onChange={(e) => dispatch({ type: "setGrid", enabled: e.target.checked })}
        />
        Grid
      </label>
      <input
        className="text-input designer-toolbar__num"
        type="number"
        title="Grid size"
        value={state.grid.size}
        onChange={(e) =>
          dispatch({ type: "setGrid", size: Math.max(1, Number(e.target.value) || 1) })
        }
      />

      <span className="designer-toolbar__synced" title="Layout auto-syncs with the Script tab">
        ● synced with Script
      </span>

      <div className="designer-toolbar__spacer" />

      <button
        className="danger"
        onClick={clearBoard}
        disabled={state.controls.length === 0}
        title="Remove all controls from the board"
      >
        Clear
      </button>
      <button onClick={save}>Save .lua</button>
    </div>
  );
}
