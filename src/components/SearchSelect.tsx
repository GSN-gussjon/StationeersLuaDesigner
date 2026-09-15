// A searchable dropdown select, matching the ic10.dev "Device hash" picker:
// a closed control that opens a popup with a search box and a filtered list.

import { useEffect, useMemo, useRef, useState } from "react";

export interface SearchOption {
  value: string;
  label: string;
  /** Optional secondary text shown dimmed after the label. */
  hint?: string;
}

interface Props {
  options: SearchOption[];
  value: string | null;
  placeholder?: string;
  onChange: (value: string) => void;
  /** Max rows rendered in the open list (for performance with large catalogs). */
  maxRows?: number;
}

export function SearchSelect({
  options,
  value,
  placeholder = "Select…",
  onChange,
  maxRows = 200,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, maxRows);
    const out: SearchOption[] = [];
    for (const o of options) {
      if (
        o.label.toLowerCase().includes(q) ||
        (o.hint && o.hint.toLowerCase().includes(q))
      ) {
        out.push(o);
        if (out.length >= maxRows) break;
      }
    }
    return out;
  }, [options, query, maxRows]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="search-select" ref={rootRef}>
      <button
        type="button"
        className="search-select__control"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "" : "search-select__placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="search-select__chevron">▾</span>
      </button>
      {open && (
        <div className="search-select__popup">
          <input
            autoFocus
            className="search-select__search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="search-select__list">
            {filtered.length === 0 && (
              <div className="search-select__empty">No matches</div>
            )}
            {filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                className={
                  "search-select__option" +
                  (o.value === value ? " search-select__option--active" : "")
                }
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span>{o.label}</span>
                {o.hint && <span className="search-select__hint">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
