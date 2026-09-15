// Typed schema describing every ScriptedScreens widget available in the layout
// designer: its category (matching the docs sidebar), editable prop/style
// fields with types + defaults, whether it is a container, which events it
// supports (for optional handler stubs), and a sensible default rect.
//
// All field names and defaults are taken from the ScriptedScreens docs
// (display-elements, shapes, icons, buttons, toggles, inputs, scrollview,
// sparkline, barchart, linechart, gauge, table, image, media, globals).
//
// This file is the single source of truth for the toolbox, the properties
// panel, and the Lua generator.

/** Toolbox categories, mirroring the documentation sidebar groups. */
export type WidgetCategory =
  | "Layout"
  | "Display Elements"
  | "Interactive Elements"
  | "Data Visualization"
  | "Drawing & Media";

/** The editor control used for a field in the properties panel. */
export type FieldType =
  | "text"
  | "multiline"
  | "number"
  | "color"
  | "bool"
  | "enum"
  | "icon";

/** Which table a field is written into when generating Lua. */
export type FieldGroup = "props" | "style";

export interface FieldDef {
  /** Key as used in the Lua props/style table, e.g. "font_size". */
  key: string;
  /** Human label in the properties panel. */
  label: string;
  group: FieldGroup;
  type: FieldType;
  /** Default value; also used to omit unchanged fields from generated Lua. */
  default: string | number | boolean;
  /** Options for enum fields (value written to Lua + label shown). */
  options?: { value: string; label: string }[];
  /** Optional help text shown under the field. */
  help?: string;
  /**
   * When true, this prop is omitted from generated Lua if it still equals the
   * schema default (same treatment as style fields). Use for optional props
   * whose default should not clutter output, e.g. resize bounds.
   */
  optional?: boolean;
}

export interface WidgetDef {
  type: string;
  /** Display name in the toolbox. */
  label: string;
  category: WidgetCategory;
  /** True if this widget can contain child elements (nested layout). */
  container: boolean;
  /**
   * When set, dropping this widget creates an auto-layout container in this
   * mode (its children's rects are computed). Implies `container: true`.
   */
  defaultLayout?: "flex" | "grid";
  /** Events this widget supports (for optional generated handler stubs). */
  events: ("click" | "change" | "toggle")[];
  /** Default rect (px) applied when the widget is dropped onto the board. */
  defaultRect: { w: number; h: number };
  /** Editable fields (props + style), in display order. */
  fields: FieldDef[];
}

// ---- Shared enum option sets ----
const ALIGN_OPTIONS = [
  { value: "left", label: "left" },
  { value: "center", label: "center" },
  { value: "right", label: "right" },
];
const DIRECTION_OPTIONS = [
  { value: "ltr", label: "Left → Right" },
  { value: "rtl", label: "Right → Left" },
  { value: "ttb", label: "Top → Bottom" },
  { value: "btt", label: "Bottom → Top" },
];
const GRADIENT_DIR_OPTIONS = [
  { value: "vertical", label: "vertical" },
  { value: "horizontal", label: "horizontal" },
  { value: "diagonal", label: "diagonal" },
  { value: "radial", label: "radial" },
];

// Convenience builders keep the definitions compact and consistent.
const f = {
  text: (key: string, label: string, group: FieldGroup, dflt = ""): FieldDef => ({
    key, label, group, type: "text", default: dflt,
  }),
  multiline: (key: string, label: string, group: FieldGroup, dflt = ""): FieldDef => ({
    key, label, group, type: "multiline", default: dflt,
  }),
  num: (key: string, label: string, group: FieldGroup, dflt = 0): FieldDef => ({
    key, label, group, type: "number", default: dflt,
  }),
  color: (key: string, label: string, group: FieldGroup, dflt = "#1E293B"): FieldDef => ({
    key, label, group, type: "color", default: dflt,
  }),
  bool: (key: string, label: string, group: FieldGroup, dflt = false): FieldDef => ({
    key, label, group, type: "bool", default: dflt,
  }),
  enum: (
    key: string, label: string, group: FieldGroup,
    options: { value: string; label: string }[], dflt: string
  ): FieldDef => ({ key, label, group, type: "enum", default: dflt, options }),
};

// Payload drag-and-drop fields (uGUI-style), shared by panel / button / icon.
// Confirmed from docs/api/display-elements.md "Drag payload & drop targets".
const DRAG_DROP_FIELDS: FieldDef[] = [
  {
    key: "drag_source", label: "Drag source", group: "props", type: "bool",
    default: false, optional: true,
    help: "This element starts a payload drag. Needs a Drag payload.",
  },
  {
    key: "drag_payload", label: "Drag payload", group: "props", type: "text",
    default: "",
    help: "Token carried to the drop target (e.g. ItemSteelIngot). Avoid '&'.",
  },
  {
    key: "drop_target", label: "Drop target", group: "props", type: "bool",
    default: false, optional: true,
    help: "Accepts drops from sources on this surface.",
  },
  {
    key: "drop_accepts", label: "Drop accepts (A|B)", group: "props", type: "text",
    default: "",
    help: "Optional whitelist of accepted payloads. Empty = accept any.",
  },
  {
    key: "drop_dispatch_id", label: "Drop dispatch id", group: "props", type: "text",
    default: "",
    help: "Optional poll_input event id (defaults to this element's id).",
  },
];

export const WIDGETS: WidgetDef[] = [
  // ---------------- Layout ----------------
  // Flex/Grid containers render + emit as panels (docs: a layout container node
  // with id defaults to type "panel"); the distinct designer type drives the
  // auto-layout mode. See emittedType()/renderType helpers.
  {
    type: "flex",
    label: "Flex Container",
    category: "Layout",
    container: true,
    defaultLayout: "flex",
    events: [],
    defaultRect: { w: 300, h: 160 },
    fields: [
      f.color("bg", "Background", "style", "#0F172A"),
    ],
  },
  {
    type: "grid",
    label: "Grid Container",
    category: "Layout",
    container: true,
    defaultLayout: "grid",
    events: [],
    defaultRect: { w: 300, h: 160 },
    fields: [
      f.color("bg", "Background", "style", "#0F172A"),
    ],
  },

  // ---------------- Display Elements ----------------
  {
    type: "label",
    label: "Label",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 160, h: 24 },
    fields: [
      f.text("text", "Text", "props", "Label"),
      f.num("font_size", "Font size", "style", 16),
      f.color("color", "Color", "style", "#FFFFFF"),
      f.enum("align", "Align", "style", ALIGN_OPTIONS, "left"),
    ],
  },
  {
    type: "panel",
    label: "Panel",
    category: "Display Elements",
    container: true,
    events: [],
    defaultRect: { w: 200, h: 120 },
    fields: [
      f.color("bg", "Background", "style", "#1E293B"),
      f.color("gradient", "Gradient end", "style", ""),
      f.enum("gradient_dir", "Gradient dir", "style", GRADIENT_DIR_OPTIONS, "vertical"),
      // Panel reposition drag (distinct from payload drag/drop below).
      {
        key: "draggable", label: "Draggable", group: "props", type: "bool",
        default: false, optional: true,
        help: "Panel receives pointer drag to reposition. Mutually exclusive with Drag source (payload).",
      },
      {
        key: "drag_to_front", label: "Drag to front", group: "props", type: "bool",
        default: true, optional: true,
        help: "Raise z_index above siblings when grabbed (desktop-window stacking).",
      },
      {
        key: "drag_group", label: "Drag group (id,id)", group: "props", type: "text",
        default: "",
        help: "Comma/semicolon element ids on the same surface that move with this drag.",
      },
      {
        key: "drag_bounds", label: "Drag bounds", group: "props", type: "text",
        default: "",
        help: "Optional clamp: 'screen', 'surface', or 'element:<id>'. Empty = unclamped.",
      },
      {
        key: "resizable", label: "Resizable", group: "props", type: "text",
        default: "",
        help: "'true'/'1'/'se'/'both' = SE corner; 'e' or 's' single axis; 'e,s' combined. Empty = off.",
      },
      { key: "resize_min_w", label: "Resize min W", group: "props", type: "number", default: 40, optional: true },
      { key: "resize_min_h", label: "Resize min H", group: "props", type: "number", default: 40, optional: true },
      { key: "resize_max_w", label: "Resize max W", group: "props", type: "number", default: 4096, optional: true },
      { key: "resize_max_h", label: "Resize max H", group: "props", type: "number", default: 4096, optional: true },
      ...DRAG_DROP_FIELDS,
    ],
  },
  {
    type: "progress",
    label: "Progress",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 200, h: 20 },
    fields: [
      f.num("value", "Value", "props", 50),
      f.num("min", "Min", "props", 0),
      f.num("max", "Max", "props", 100),
      f.bool("indeterminate", "Indeterminate", "props", false),
      f.enum("direction", "Direction", "props", DIRECTION_OPTIONS, "ltr"),
      f.color("bg", "Track bg", "style", "#1E293B"),
      f.color("fill", "Fill", "style", "#22C55E"),
      {
        key: "color_stops", label: "Color stops (0.5:#hex|0.8:#hex)", group: "style", type: "text",
        default: "",
        help: "Fill color thresholds: fraction:color pairs, e.g. 0.5:#EAB308|0.8:#EF4444.",
      },
      { key: "speed", label: "Indeterminate speed", group: "style", type: "number", default: 1.2, optional: true },
    ],
  },
  {
    type: "divider",
    label: "Divider",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 200, h: 1 },
    fields: [f.color("color", "Color", "style", "#334155")],
  },
  {
    type: "spinner",
    label: "Spinner",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 40, h: 40 },
    fields: [
      f.color("color", "Arc color", "style", "#38BDF8"),
      f.color("track_color", "Track color", "style", ""),
      f.num("thickness", "Thickness", "style", 4),
      f.num("arc_length", "Arc length", "style", 0.3),
      f.num("speed", "Speed", "style", 2),
    ],
  },
  {
    type: "line",
    label: "Line",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 200, h: 2 },
    fields: [
      f.num("x1", "X1", "props", 0),
      f.num("y1", "Y1", "props", 0),
      f.num("x2", "X2", "props", 200),
      f.num("y2", "Y2", "props", 0),
      f.color("color", "Color", "style", "#FFFFFF"),
      f.num("thickness", "Thickness", "style", 2),
    ],
  },
  {
    type: "rect_outline",
    label: "Rect Outline",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 120, h: 80 },
    fields: [
      f.color("color", "Color", "style", "#334155"),
      f.num("thickness", "Thickness", "style", 2),
    ],
  },
  {
    type: "circle",
    label: "Circle",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 50, h: 50 },
    fields: [
      f.bool("filled", "Filled", "props", true),
      f.color("bg", "Fill (filled)", "style", "#B36200"),
      f.color("color", "Stroke (outline)", "style", "#B36200"),
      f.num("thickness", "Thickness", "style", 2),
    ],
  },
  {
    type: "icon",
    label: "Icon",
    category: "Display Elements",
    container: false,
    events: [],
    defaultRect: { w: 24, h: 24 },
    fields: [
      {
        key: "name", label: "Icon", group: "props", type: "icon", default: "gas:Oxygen",
        help: "Pick a gas/slot/prefab icon, or type any custom prefab name.",
      },
      { key: "color_index", label: "Color index", group: "props", type: "text", default: "", help: "Painted color variant index (prefab icons)." },
      f.color("tint", "Tint", "style", "#FFFFFF"),
      ...DRAG_DROP_FIELDS,
    ],
  },

  // ---------------- Interactive Elements ----------------
  {
    type: "button",
    label: "Button",
    category: "Interactive Elements",
    container: false,
    events: ["click"],
    defaultRect: { w: 120, h: 36 },
    fields: [
      f.text("text", "Text", "props", "Button"),
      f.color("bg", "Background", "style", "#334155"),
      f.color("text", "Text color", "style", "#FFFFFF"),
      f.num("font_size", "Font size", "style", 14),
      f.color("gradient", "Gradient end", "style", ""),
      f.enum("gradient_dir", "Gradient dir", "style", GRADIENT_DIR_OPTIONS, "vertical"),
      ...DRAG_DROP_FIELDS,
    ],
  },
  {
    type: "interface_button",
    label: "Interface Button",
    category: "Interactive Elements",
    container: false,
    events: ["click"],
    defaultRect: { w: 140, h: 30 },
    fields: [
      f.text("text", "Text", "props", "INTERFACE"),
      f.color("bg", "Background", "style", "#1E40AF"),
      f.color("text", "Text color", "style", "#FFFFFF"),
      f.num("font_size", "Font size", "style", 14),
    ],
  },
  {
    type: "checkbox",
    label: "Checkbox",
    category: "Interactive Elements",
    container: false,
    events: ["click"],
    defaultRect: { w: 160, h: 24 },
    fields: [
      f.text("text", "Text", "props", "Option"),
      f.bool("checked", "Checked", "props", false),
      f.color("bg", "Background", "style", ""),
      f.color("check_color", "Check color", "style", "#22C55E"),
      f.color("text", "Text color", "style", "#E2E8F0"),
      f.num("font_size", "Font size", "style", 12),
    ],
  },
  {
    type: "radio",
    label: "Radio",
    category: "Interactive Elements",
    container: false,
    events: ["click"],
    defaultRect: { w: 160, h: 24 },
    fields: [
      f.text("text", "Text", "props", "Option"),
      f.bool("selected", "Selected", "props", false),
      f.color("bg", "Background", "style", ""),
      f.color("radio_color", "Radio color", "style", "#22C55E"),
      f.color("text", "Text color", "style", "#E2E8F0"),
      f.num("font_size", "Font size", "style", 12),
    ],
  },
  {
    type: "toggle",
    label: "Toggle",
    category: "Interactive Elements",
    container: false,
    events: ["click"],
    defaultRect: { w: 54, h: 26 },
    fields: [
      f.bool("value", "On", "props", false),
      f.color("on_color", "On color", "style", "#22C55E"),
      f.color("off_color", "Off color", "style", "#334155"),
      f.color("knob", "Knob", "style", "#FFFFFF"),
    ],
  },
  {
    type: "slider",
    label: "Slider",
    category: "Interactive Elements",
    container: false,
    events: ["change"],
    defaultRect: { w: 200, h: 20 },
    fields: [
      f.num("value", "Value", "props", 50),
      f.num("min", "Min", "props", 0),
      f.num("max", "Max", "props", 100),
      f.enum("direction", "Direction", "props", DIRECTION_OPTIONS, "ltr"),
      f.color("bg", "Track bg", "style", "#1E293B"),
      f.color("fill", "Fill", "style", "#3B82F6"),
      f.color("handle", "Handle", "style", "#FFFFFF"),
    ],
  },
  {
    type: "select",
    label: "Select",
    category: "Interactive Elements",
    container: false,
    events: ["change"],
    defaultRect: { w: 200, h: 28 },
    fields: [
      // Options are entered as a pipe-delimited string; the generator emits an array.
      f.text("options", "Options (A|B|C)", "props", "Auto|Manual|Off"),
      f.text("selected", "Selected index", "props", "0"),
      {
        key: "open", label: "Open (legacy)", group: "props", type: "text",
        default: "",
        help: "Optional 'true'/'false' for legacy manual open state. Empty = client-managed.",
      },
      f.enum(
        "multi", "Multi mode", "props",
        [
          { value: "none", label: "none" },
          { value: "highlight", label: "highlight" },
          { value: "checkbox", label: "checkbox" },
        ],
        "none"
      ),
      f.color("bg", "Background", "style", "#1E293B"),
      f.color("text", "Text color", "style", "#E2E8F0"),
      f.num("font_size", "Font size", "style", 12),
      f.color("selected_bg", "Selected bg", "style", "#2563EB"),
    ],
  },
  {
    type: "textinput",
    label: "Text Input",
    category: "Interactive Elements",
    container: false,
    events: ["change"],
    defaultRect: { w: 200, h: 28 },
    fields: [
      f.text("value", "Value", "props", ""),
      f.text("placeholder", "Placeholder", "props", "Enter text…"),
      f.text("title", "Dialog title", "props", ""),
      f.color("bg", "Background", "style", "#0F172A"),
      f.color("text", "Text color", "style", "#E2E8F0"),
      f.color("placeholder_color", "Placeholder color", "style", "#475569"),
      f.num("font_size", "Font size", "style", 12),
    ],
  },
  {
    type: "scrollview",
    label: "ScrollView",
    category: "Interactive Elements",
    container: true,
    events: [],
    defaultRect: { w: 300, h: 160 },
    fields: [
      f.num("content_height", "Content height", "props", 500),
      f.color("bg", "Background", "style", "#0F172A"),
      f.color("scrollbar_bg", "Scrollbar bg", "style", "#1E293B"),
      f.color("scrollbar_handle", "Scrollbar handle", "style", "#475569"),
      f.num("scroll_speed", "Scroll speed", "style", 20),
      f.num("padding_bottom", "Content padding bottom", "style", 20),
    ],
  },

  // ---------------- Data Visualization ----------------
  {
    type: "sparkline",
    label: "Sparkline",
    category: "Data Visualization",
    container: false,
    events: [],
    defaultRect: { w: 200, h: 60 },
    fields: [
      f.num("capacity", "Capacity", "props", 64),
      f.num("min", "Min", "props", 0),
      f.num("max", "Max", "props", 100),
      f.color("bg", "Background", "style", "#111827"),
      f.color("line_color", "Line color", "style", "#22C55E"),
      f.color("fill_color", "Fill color", "style", "#22C55E20"),
      f.num("thickness", "Thickness", "style", 2),
    ],
  },
  {
    type: "barchart",
    label: "Bar Chart",
    category: "Data Visualization",
    container: false,
    events: [],
    defaultRect: { w: 300, h: 100 },
    fields: [
      f.text("labels", "Labels (A|B|C)", "props", "O2|N2|CO2"),
      f.text("values", "Values (1,2,3)", "props", "21,78,1"),
      f.text("colors", "Bar colors (A|B)", "props", ""),
      { key: "min", label: "Min", group: "props", type: "number", default: 0, optional: true },
      f.num("max", "Max", "props", 100),
      f.color("bg", "Background", "style", "#111827"),
      f.color("bar_color", "Bar color", "style", "#3B82F6"),
      f.color("label_color", "Label color", "style", "#94A3B8"),
      f.color("value_color", "Value color", "style", "#E2E8F0"),
      f.num("font_size", "Font size", "style", 9),
      f.num("gap", "Gap", "style", 4),
      f.bool("show_values", "Show values", "style", false),
    ],
  },
  {
    type: "linechart",
    label: "Line Chart",
    category: "Data Visualization",
    container: false,
    events: [],
    defaultRect: { w: 300, h: 120 },
    fields: [
      f.num("capacity", "Capacity", "props", 64),
      // series data is streamed at runtime; these configure its presentation.
      f.text("series_colors", "Series colors (A|B)", "props", ""),
      f.text("series_labels", "Series labels (A|B)", "props", ""),
      f.text("x_labels", "X labels (A|B)", "props", ""),
      { key: "min", label: "Min (auto if empty)", group: "props", type: "text", default: "" },
      { key: "max", label: "Max (auto if empty)", group: "props", type: "text", default: "" },
      f.color("bg", "Background", "style", "#111827"),
      f.color("grid_color", "Grid color", "style", ""),
      f.color("axis_color", "Axis color", "style", ""),
      f.color("label_color", "Label color", "style", ""),
      f.bool("show_grid", "Show grid", "style", false),
      f.bool("show_legend", "Show legend", "style", false),
      f.bool("fill", "Fill", "style", false),
      f.num("thickness", "Thickness", "style", 2),
      f.num("font_size", "Font size", "style", 9),
    ],
  },
  {
    type: "gauge",
    label: "Gauge",
    category: "Data Visualization",
    container: false,
    events: [],
    defaultRect: { w: 120, h: 80 },
    fields: [
      f.num("value", "Value", "props", 50),
      f.num("min", "Min", "props", 0),
      f.num("max", "Max", "props", 100),
      f.num("warn", "Warn frac", "props", 0.6),
      f.num("danger", "Danger frac", "props", 0.85),
      f.bool("invert", "Invert", "props", false),
      f.text("label", "Label", "props", ""),
      f.text("unit", "Unit", "props", ""),
      f.color("bg", "Background", "style", "#111827"),
      f.color("arc_color", "Arc color", "style", ""),
      f.color("needle_color", "Needle color", "style", ""),
      f.color("normal_color", "Normal zone", "style", ""),
      f.color("warn_color", "Warn zone", "style", ""),
      f.color("danger_color", "Danger zone", "style", ""),
      f.num("arc_thickness", "Arc thickness", "style", 8),
      f.num("font_size", "Font size", "style", 12),
      f.color("value_color", "Value color", "style", "#E2E8F0"),
      f.color("label_color", "Label color", "style", "#64748B"),
    ],
  },
  {
    type: "table",
    label: "Table",
    category: "Data Visualization",
    container: false,
    events: ["click", "change"],
    defaultRect: { w: 300, h: 120 },
    fields: [
      f.text("columns", "Columns (A|B)", "props", "Zone|Temp|Status"),
      f.text("col_widths", "Col widths (2,1,1)", "props", ""),
      { key: "selected_row", label: "Selected row (0=none)", group: "props", type: "number", default: 0, optional: true },
      { key: "sort_column", label: "Sort column (0=none)", group: "props", type: "number", default: 0, optional: true },
      {
        key: "sort_dir", label: "Sort dir", group: "props", type: "enum",
        default: "asc", optional: true,
        options: [
          { value: "asc", label: "asc" },
          { value: "desc", label: "desc" },
        ],
      },
      f.color("header_bg", "Header bg", "style", "#1E293B"),
      f.color("header_color", "Header color", "style", "#94A3B8"),
      f.color("row_bg", "Row bg", "style", "#111827"),
      f.color("alt_row_bg", "Alt row bg", "style", "#0F172A"),
      f.color("row_color", "Row color", "style", "#E2E8F0"),
      f.color("selected_bg", "Selected bg", "style", ""),
      f.color("selected_color", "Selected color", "style", ""),
      f.num("font_size", "Font size", "style", 11),
      f.num("row_height", "Row height", "style", 22),
    ],
  },

  // ---------------- Drawing & Media ----------------
  {
    type: "image",
    label: "Image",
    category: "Drawing & Media",
    container: false,
    events: [],
    defaultRect: { w: 200, h: 120 },
    fields: [f.text("url", "URL", "props", "")],
  },
  {
    type: "media",
    label: "Media (Video)",
    category: "Drawing & Media",
    container: false,
    events: [],
    defaultRect: { w: 300, h: 170 },
    fields: [
      f.text("url", "URL", "props", ""),
      f.bool("playing", "Playing", "props", false),
      f.num("volume", "Volume", "props", 1),
      f.bool("loop", "Loop", "props", false),
      { key: "time", label: "Seek time (s)", group: "props", type: "text", default: "", help: "Seek to a specific time in seconds." },
    ],
  },
];

/** Fast lookup by widget type. */
export const WIDGET_BY_TYPE = new Map<string, WidgetDef>(
  WIDGETS.map((w) => [w.type, w])
);

/**
 * The Lua element `type` a designer widget emits. Layout containers (flex/grid)
 * are authored as distinct designer types but are panels at runtime, matching
 * the docs where a layout container node defaults to `type = "panel"`.
 */
export function emittedType(designerType: string): string {
  return designerType === "flex" || designerType === "grid"
    ? "panel"
    : designerType;
}

/** Categories in display order. */
export const CATEGORY_ORDER: WidgetCategory[] = [
  "Layout",
  "Display Elements",
  "Interactive Elements",
  "Data Visualization",
  "Drawing & Media",
];

/** Widgets grouped by category, preserving definition order within each. */
export function widgetsByCategory(): { category: WidgetCategory; widgets: WidgetDef[] }[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    widgets: WIDGETS.filter((w) => w.category === category),
  }));
}

/** Build the initial props table for a freshly-dropped widget from defaults. */
export function defaultProps(def: WidgetDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.group === "props") out[field.key] = field.default;
  }
  return out;
}

/** Build the initial style table for a freshly-dropped widget from defaults. */
export function defaultStyle(def: WidgetDef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of def.fields) {
    if (field.group === "style") out[field.key] = field.default;
  }
  return out;
}
