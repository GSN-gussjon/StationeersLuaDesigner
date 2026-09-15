// Assembles the layout designer: toolbar on top, then a three-column body
// (toolbox | design canvas | properties).
//
// The DesignerProvider lives in the parent (EditorPane) so the designer's state
// survives switching tabs, and the SyncBridge keeps it in sync with the Script
// tab. This view is kept mounted and hidden via CSS rather than unmounted.

import { Toolbox } from "./Toolbox";
import { DesignCanvas } from "./DesignCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { DesignerToolbar } from "./DesignerToolbar";

export function DesignerView() {
  return (
    <div className="designer">
      <DesignerToolbar />
      <div className="designer__body">
        <aside className="designer__toolbox">
          <Toolbox />
        </aside>
        <main className="designer__canvas">
          <DesignCanvas />
        </main>
        <aside className="designer__props">
          <PropertiesPanel />
        </aside>
      </div>
    </div>
  );
}
