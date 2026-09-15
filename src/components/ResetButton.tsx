// A global "Reset session" action: wipes all persisted state (script, devices,
// designer layout, screen size, saved session) back to the empty project, and
// reloads so every store re-initializes from defaults. Shows a clear,
// destructive-action warning first.

import { useState } from "react";
import { clearAllPersisted } from "../state/sessionPersist";

export function ResetButton() {
  const [confirming, setConfirming] = useState(false);

  function doReset() {
    clearAllPersisted();
    // Reload so the store's lazy initializer rebuilds from defaults.
    window.location.reload();
  }

  return (
    <>
      <button
        className="danger"
        title="Reset the whole project to an empty starter"
        onClick={() => setConfirming(true)}
      >
        Reset
      </button>

      {confirming && (
        <div className="modal-overlay" onMouseDown={() => setConfirming(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h2>Reset everything?</h2>
              <button
                className="modal__close"
                onClick={() => setConfirming(false)}
              >
                ×
              </button>
            </div>
            <div className="reset-warning">
              <p className="reset-warning__lead">
                This permanently clears your entire project and cannot be undone.
              </p>
              <ul>
                <li>The <strong>script</strong> (including your own code)</li>
                <li>All <strong>devices</strong> and their values</li>
                <li>The <strong>designer layout</strong></li>
                <li>Screen size and saved session</li>
              </ul>
              <p className="reset-warning__hint">
                Tip: use <strong>Save .lua</strong> or export your state first if
                you want to keep it.
              </p>
            </div>
            <div className="modal__actions">
              <button onClick={() => setConfirming(false)}>Cancel</button>
              <button className="danger reset-warning__confirm" onClick={doReset}>
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
