// Toolbox: the palette of widgets grouped by category (matching the docs
// sidebar). Each widget is an HTML5 drag source; the widget type travels in
// dataTransfer and is read by the design canvas on drop. Clicking a widget also
// adds it at a default position (convenience for non-drag placement).

import { widgetsByCategory, type WidgetDef } from "./widgetSchema";
import { useDesigner } from "./designerStore";

/** Custom MIME so only our widgets are accepted by the canvas drop target. */
export const WIDGET_DND_TYPE = "application/x-ss-widget";

export function Toolbox() {
  const { dispatch } = useDesigner();
  const groups = widgetsByCategory();

  const onDragStart = (e: React.DragEvent, def: WidgetDef) => {
    e.dataTransfer.setData(WIDGET_DND_TYPE, def.type);
    // Also set text/plain so the drag has a visible label in some browsers.
    e.dataTransfer.setData("text/plain", def.type);
    e.dataTransfer.effectAllowed = "copy";
  };

  // Fallback placement when the user clicks instead of dragging.
  const onAdd = (def: WidgetDef) => {
    dispatch({ type: "add", widgetType: def.type, x: 20, y: 20, parentId: null });
  };

  return (
    <div className="toolbox">
      {groups.map(({ category, widgets }) => (
        <div key={category} className="toolbox__group">
          <div className="toolbox__group-title">{category}</div>
          {widgets.map((def) => (
            <button
              key={def.type}
              className="toolbox__item"
              draggable
              onDragStart={(e) => onDragStart(e, def)}
              onClick={() => onAdd(def)}
              title={`Drag onto the board, or click to add. ${
                def.container ? "(container)" : ""
              }`}
            >
              <span className="toolbox__item-label">{def.label}</span>
              {def.container && <span className="toolbox__badge">box</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
