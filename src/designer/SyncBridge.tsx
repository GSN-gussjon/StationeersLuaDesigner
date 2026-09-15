// Keeps the Design tab (control tree) and the Script tab (Lua text) in sync,
// WinForms-style: the designer owns the layout region of the script; the rest
// is user code.
//
// Loop-free design: instead of racing two effects that watch each other's
// state, a single effect watches BOTH inputs and reconciles them against a
// remembered "last reconciled" snapshot (script signature + controls
// signature). It only dispatches when an input actually changed since the last
// reconciliation, and never dispatches both directions in one pass. This makes
// echoes (our own writes coming back) no-ops by construction.
//
// Renders nothing; must be mounted inside BOTH the app store and DesignerProvider.

import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { useDesigner } from "./designerStore";
import { controlsSignature } from "./designerModel";
import { mergeDesignerScript } from "./generateLua";
import { parseDesignerBlock } from "./parseDesignerBlock";

export function SyncBridge() {
  const { state: app, dispatch: appDispatch } = useStore();
  const { state: designer, dispatch: designerDispatch } = useDesigner();

  // Snapshot of what we last reconciled, so we can tell which side changed.
  const last = useRef<{ script: string; controlsSig: string } | null>(null);

  useEffect(() => {
    const script = app.script;
    const controls = designer.controls;
    const controlsSig = controlsSignature(controls);

    const prev = last.current;
    const scriptChanged = !prev || prev.script !== script;
    const controlsChanged = !prev || prev.controlsSig !== controlsSig;

    // Nothing changed since last reconcile (or a re-render with new object
    // identities but identical content): do nothing.
    if (!scriptChanged && !controlsChanged) return;

    const parsed = parseDesignerBlock(script);
    const parsedSig = parsed ? controlsSignature(parsed) : null;

    // Case 1: the script and the designer already agree (parsed block matches
    // the current controls). Just record the snapshot; no dispatch.
    if (parsedSig !== null && parsedSig === controlsSig) {
      last.current = { script, controlsSig };
      return;
    }

    // Case 2: the script text changed and its block differs from the designer
    // -> pull the block into the designer (Script -> Design). Prefer this when
    // the script changed, so manual edits win.
    if (scriptChanged && parsed !== null && parsedSig !== controlsSig) {
      // Record with the parsed signature so the follow-up render (after load)
      // sees no change and stops.
      last.current = { script, controlsSig: parsedSig ?? controlsSig };
      designerDispatch({ type: "load", controls: parsed });
      return;
    }

    // Case 3: the controls changed (or the script has no/invalid block) ->
    // regenerate the layout region (Design -> Script). Skip if the designer is
    // empty and the script has no block yet (don't mutate a fresh user script).
    if (controlsChanged) {
      if (controls.length === 0 && parsed === null) {
        last.current = { script, controlsSig };
        return;
      }
      const merged = mergeDesignerScript(script, controls);
      if (merged !== script) {
        last.current = { script: merged, controlsSig };
        appDispatch({ type: "setScript", script: merged });
      } else {
        last.current = { script, controlsSig };
      }
      return;
    }

    // Fallback: script changed but has no parseable block (user editing code
    // outside the region) — record and leave the designer alone.
    last.current = { script, controlsSig };
  }, [app.script, designer.controls, appDispatch, designerDispatch]);

  return null;
}
