// Properties panel: typed editors for the selected control, driven by the
// widget schema. Sections: Layout (rect + z), Props, Style, and optional
// event-handler stubs. Mirrors the Visual Studio properties grid.

import { useEffect, useMemo, useRef, useState } from "react";
import { useDesigner } from "./designerStore";
import { WIDGET_BY_TYPE, type FieldDef } from "./widgetSchema";
import {
  autoHandlerName,
  type DesignControl,
  type EventKind,
} from "./designerModel";
import { ICON_GROUPS, iconValueLabel } from "./iconCatalog";
import { useScriptNav } from "./scriptNav";

export function PropertiesPanel() {
  const { state, dispatch } = useDesigner();
  const scriptNav = useScriptNav();
  const control = state.selectedId
    ? state.controls.find((c) => c.id === state.selectedId)
    : undefined;

  if (!control) {
    return (
      <div className="props-panel">
        <div className="empty-hint">Select a control to edit its properties.</div>
      </div>
    );
  }

  const def = WIDGET_BY_TYPE.get(control.type);
  if (!def) {
    return (
      <div className="props-panel">
        <div className="empty-hint">Unknown control type: {control.type}</div>
      </div>
    );
  }

  const propFields = def.fields.filter((f) => f.group === "props");
  const styleFields = def.fields.filter((f) => f.group === "style");

  const setField = (fieldDef: FieldDef, value: unknown) => {
    const target = fieldDef.group === "props" ? "props" : "style";
    dispatch({
      type: "update",
      id: control.id,
      patch: {
        [target]: { ...control[target], [fieldDef.key]: value },
      } as Partial<DesignControl>,
    });
  };

  const setRect = (key: "x" | "y" | "w" | "h", value: number) => {
    dispatch({ type: "setRect", id: control.id, rect: { [key]: value } });
  };

  const setZ = (z: number) => {
    dispatch({ type: "update", id: control.id, patch: { z } });
  };

  const setHandler = (ev: EventKind, name: string) => {
    dispatch({
      type: "update",
      id: control.id,
      patch: { handlers: { ...control.handlers, [ev]: name } },
    });
  };

  const setLayoutOpt = (key: keyof NonNullable<DesignControl["layoutOpts"]>, value: unknown) => {
    dispatch({
      type: "update",
      id: control.id,
      patch: { layoutOpts: { ...(control.layoutOpts ?? {}), [key]: value } },
    });
  };

  const setFlexN = (value: number) => {
    dispatch({ type: "update", id: control.id, patch: { flexN: value } });
  };

  // Is this control's parent an auto-layout container? Then its size is driven
  // by flex/grid, and we expose per-child sizing instead of raw W/H.
  const parent = control.parentId
    ? state.controls.find((c) => c.id === control.parentId)
    : undefined;
  const layoutManaged = Boolean(parent?.layout);

  return (
    <div className="props-panel">
      <div className="props-panel__head">
        <div className="props-panel__type">{def.label}</div>
      </div>

      <Section title="Identity">
        <IdField
          key={control.id}
          control={control}
          existingIds={state.controls.map((c) => c.id)}
          onRename={(newId) =>
            dispatch({ type: "rename", id: control.id, newId })
          }
        />
      </Section>

      {/* Auto-layout container options */}
      {control.layout && (
        <Section title={`${control.layout === "grid" ? "Grid" : "Flex"} layout`}>
          <LayoutOptsEditor
            layout={control.layout}
            opts={control.layoutOpts ?? {}}
            onChange={setLayoutOpt}
          />
        </Section>
      )}

      {/* Layout / position */}
      <Section title="Layout">
        {layoutManaged ? (
          <>
            <div className="field__help">
              Position and size are computed by the parent{" "}
              {parent?.layout === "grid" ? "grid" : "flex"} container.
            </div>
            {parent?.layout === "flex" && (
              <NumberField
                label="Flex grow (0 = fixed)"
                value={control.flexN ?? 0}
                onChange={(v) => setFlexN(Math.max(0, v))}
              />
            )}
            <div className="props-grid2">
              <NumberField label="W (fixed)" value={control.rect.w} onChange={(v) => setRect("w", v)} />
              <NumberField label="H (fixed)" value={control.rect.h} onChange={(v) => setRect("h", v)} />
              <NumberField label="Z" value={control.z} onChange={setZ} />
            </div>
          </>
        ) : (
          <div className="props-grid2">
            <NumberField label="X" value={control.rect.x} onChange={(v) => setRect("x", v)} />
            <NumberField label="Y" value={control.rect.y} onChange={(v) => setRect("y", v)} />
            <NumberField label="W" value={control.rect.w} onChange={(v) => setRect("w", v)} />
            <NumberField label="H" value={control.rect.h} onChange={(v) => setRect("h", v)} />
            <NumberField label="Z" value={control.z} onChange={setZ} />
          </div>
        )}
      </Section>

      {/* Props */}
      {propFields.length > 0 && (
        <Section title="Properties">
          {propFields.map((fd) => (
            <FieldEditor
              key={fd.key}
              def={fd}
              value={control.props[fd.key]}
              onChange={(v) => setField(fd, v)}
            />
          ))}
        </Section>
      )}

      {/* Style */}
      {styleFields.length > 0 && (
        <Section title="Style">
          {styleFields.map((fd) => (
            <FieldEditor
              key={fd.key}
              def={fd}
              value={control.style[fd.key]}
              onChange={(v) => setField(fd, v)}
            />
          ))}
        </Section>
      )}

      {/* Event handlers */}
      {def.events.length > 0 && (
        <Section title="Events">
          {def.events.map((ev) => {
            const value = control.handlers[ev] ?? "";
            const suggestion = autoHandlerName(control.id, ev);
            return (
              <div key={ev} className="props-row event-row">
                <label className="props-row__label">on_{ev}</label>
                <input
                  className="text-input"
                  value={value}
                  placeholder={suggestion}
                  spellCheck={false}
                  onChange={(e) => setHandler(ev, e.target.value)}
                />
                {value.trim() === "" ? (
                  <button
                    className="event-row__wire"
                    title={`Wire on_${ev} to ${suggestion}`}
                    onClick={() => setHandler(ev, suggestion)}
                  >
                    +
                  </button>
                ) : (
                  <button
                    className="event-row__goto"
                    title={`Go to ${value.trim()}() in the Script tab`}
                    disabled={!scriptNav}
                    onClick={() => scriptNav?.goToHandler(value.trim())}
                  >
                    {/* Right-arrow "jump to code" glyph */}
                    →
                  </button>
                )}
              </div>
            );
          })}
          <div className="field__help event-help">
            Enter a function name to wire the event. An empty stub is added to
            your code (below the designer region) and never overwritten.
          </div>
        </Section>
      )}

      <button
        className="danger props-panel__delete"
        onClick={() => dispatch({ type: "delete", id: control.id })}
      >
        Delete control
      </button>
    </div>
  );
}

/**
 * Editable control Id with uniqueness validation. Typing is unrestricted, but a
 * rename is only committed when the value is a valid, unique identifier;
 * otherwise an inline error is shown and the change is blocked.
 */
function IdField({
  control,
  existingIds,
  onRename,
}: {
  control: DesignControl;
  existingIds: string[];
  onRename: (newId: string) => void;
}) {
  const [value, setValue] = useState(control.id);

  const trimmed = value.trim();
  const others = existingIds.filter((id) => id !== control.id);
  let error: string | null = null;
  if (trimmed === "") error = "Id cannot be empty.";
  else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed))
    error = "Use letters, digits, underscore; must not start with a digit.";
  else if (others.includes(trimmed)) error = "Another control already uses this Id.";

  const commit = () => {
    if (error || trimmed === control.id) {
      // Invalid or unchanged: revert the field to the current id.
      if (error) setValue(control.id);
      return;
    }
    onRename(trimmed);
  };

  return (
    <div className="props-row props-row--col">
      <label className="props-row__label">Id</label>
      <input
        className={"text-input" + (error ? " text-input--error" : "")}
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "Escape") {
            setValue(control.id);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {error && <div className="props-id-error">{error}</div>}
    </div>
  );
}

/** Editors for a container's flex/grid layout options. */
function LayoutOptsEditor({
  layout,
  opts,
  onChange,
}: {
  layout: "flex" | "grid";
  opts: NonNullable<DesignControl["layoutOpts"]>;
  onChange: (key: keyof NonNullable<DesignControl["layoutOpts"]>, value: unknown) => void;
}) {
  // Padding is edited as a uniform number here (the model/generator also accept
  // per-side objects when authored in code).
  const padValue =
    typeof opts.padding === "number" ? opts.padding : 0;

  return (
    <>
      {layout === "flex" && (
        <div className="props-row">
          <label className="props-row__label">Direction</label>
          <select
            className="text-input"
            value={opts.direction ?? "row"}
            onChange={(e) => onChange("direction", e.target.value)}
          >
            <option value="row">row</option>
            <option value="column">column</option>
          </select>
        </div>
      )}
      {layout === "grid" && (
        <NumberField
          label="Columns"
          value={opts.cols ?? 2}
          onChange={(v) => onChange("cols", Math.max(1, Math.round(v)))}
        />
      )}
      {layout === "grid" && (
        <NumberField
          label="Row height (0 = square)"
          value={opts.rowHeight ?? 0}
          onChange={(v) => onChange("rowHeight", v > 0 ? v : undefined)}
        />
      )}
      <NumberField label="Gap" value={opts.gap ?? 4} onChange={(v) => onChange("gap", v)} />
      <NumberField label="Padding" value={padValue} onChange={(v) => onChange("padding", v)} />
      {layout === "flex" && (
        <>
          <div className="props-row">
            <label className="props-row__label">Align (cross)</label>
            <select
              className="text-input"
              value={opts.align ?? "stretch"}
              onChange={(e) => onChange("align", e.target.value)}
            >
              <option value="stretch">stretch</option>
              <option value="start">start</option>
              <option value="center">center</option>
              <option value="end">end</option>
            </select>
          </div>
          <div className="props-row">
            <label className="props-row__label">Justify (main)</label>
            <select
              className="text-input"
              value={opts.justify ?? "start"}
              onChange={(e) => onChange("justify", e.target.value)}
            >
              <option value="start">start</option>
              <option value="center">center</option>
              <option value="end">end</option>
              <option value="between">between</option>
              <option value="evenly">evenly</option>
            </select>
          </div>
        </>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="props-section">
      <div className="props-section__title">{title}</div>
      {children}
    </div>
  );
}

function FieldEditor(props: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const { def } = props;
  return (
    <>
      <FieldControl {...props} />
      {def.help && <div className="field__help">{def.help}</div>}
    </>
  );
}

function FieldControl({
  def,
  value,
  onChange,
}: {
  def: FieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (def.type) {
    case "number":
      return (
        <NumberField
          label={def.label}
          value={Number(value ?? def.default)}
          onChange={onChange}
        />
      );
    case "color":
      return (
        <ColorField
          label={def.label}
          value={String(value ?? def.default)}
          onChange={onChange}
        />
      );
    case "bool":
      return (
        <label className="props-check">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{def.label}</span>
        </label>
      );
    case "enum":
      return (
        <div className="props-row">
          <label className="props-row__label">{def.label}</label>
          <select
            className="text-input"
            value={String(value ?? def.default)}
            onChange={(e) => onChange(e.target.value)}
          >
            {def.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "multiline":
      return (
        <div className="props-row props-row--col">
          <label className="props-row__label">{def.label}</label>
          <textarea
            className="text-input"
            rows={3}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "icon":
      return (
        <div className="props-row props-row--col">
          <label className="props-row__label">{def.label}</label>
          <IconPicker value={String(value ?? "")} onChange={onChange} />
        </div>
      );
    case "text":
    default:
      return (
        <div className="props-row">
          <label className="props-row__label">{def.label}</label>
          <input
            className="text-input"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
  }
}

/**
 * Categorized, searchable icon picker (autocomplete). Typing filters the
 * catalog across gas/slot/prefab groups; picking an entry stores "<kind>:<Name>".
 * Free text that doesn't match the catalog is kept as a raw custom prefab name.
 */
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: unknown) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Filter catalog groups by the query (matches name or alias, case-insensitive).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ICON_GROUPS.map((g) => ({
      group: g,
      entries: g.entries.filter(
        (e) =>
          q === "" ||
          e.name.toLowerCase().includes(q) ||
          (e.alias?.toLowerCase().includes(q) ?? false)
      ),
    })).filter((g) => g.entries.length > 0);
  }, [query]);

  const pick = (kind: string, name: string) => {
    onChange(`${kind}:${name}`);
    setOpen(false);
    setQuery("");
  };

  const useCustom = () => {
    const raw = query.trim();
    if (raw) {
      onChange(raw);
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <div className="icon-picker" ref={wrapRef}>
      <button
        type="button"
        className="text-input icon-picker__value"
        onClick={() => setOpen((o) => !o)}
        title={value}
      >
        {value ? iconValueLabel(value) : "Select icon…"}
      </button>

      {open && (
        <div className="icon-picker__pop">
          <input
            className="text-input icon-picker__search"
            placeholder="Search icons…"
            value={query}
            autoFocus
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          />
          <div className="icon-picker__list">
            {filtered.map(({ group, entries }) => (
              <div key={group.label} className="icon-picker__group">
                <div className="icon-picker__group-label">{group.label}</div>
                {entries.map((e) => {
                  const key = `${group.kind}:${e.name}`;
                  return (
                    <button
                      type="button"
                      key={key}
                      className={
                        "icon-picker__item" +
                        (value === key ? " icon-picker__item--sel" : "")
                      }
                      onClick={() => pick(group.kind, e.name)}
                    >
                      {e.name}
                      {e.alias && <span className="icon-picker__alias"> ({e.alias})</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="icon-picker__empty">
                No catalog match.
                {query.trim() && (
                  <button type="button" className="icon-picker__custom" onClick={useCustom}>
                    Use “{query.trim()}” as custom prefab
                  </button>
                )}
              </div>
            )}
          </div>
          {filtered.length > 0 && query.trim() && (
            <button type="button" className="icon-picker__custom" onClick={useCustom}>
              Use “{query.trim()}” as custom prefab name
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="props-row">
      <label className="props-row__label">{label}</label>
      <input
        className="text-input"
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
      />
    </div>
  );
}

/**
 * Color editor: a native color swatch plus a text field, so 8-digit hex with
 * alpha (e.g. #22C55E20) can still be entered (the swatch only handles #RRGGBB).
 */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const swatch = /^#[0-9a-fA-F]{6}/.test(value) ? value.slice(0, 7) : "#000000";
  return (
    <div className="props-row">
      <label className="props-row__label">{label}</label>
      <div className="color-field">
        <input
          type="color"
          value={swatch}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="text-input"
          value={value}
          placeholder="#RRGGBB or empty"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
