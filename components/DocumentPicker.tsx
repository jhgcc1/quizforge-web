"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { CatalogEntry } from "@quizforge/contract";

/** The option that is not a document: let the user paste any URL. */
export const CUSTOM = "__custom__";

/**
 * The document picker.
 *
 * It is a combobox rather than a `<select>` because the catalogue is no longer a fixed list: every document that
 * generates a quiz cleanly joins it, so it grows with use and a plain dropdown becomes a long scroll. Typing filters
 * on the title, the description and the URL, which is what someone looking for "that elasticsearch readme" will type.
 *
 * It is built by hand, with the ARIA combobox roles, because `<select>` cannot filter and `<datalist>` cannot group or
 * show the description line. Keyboard: arrows move, Enter picks, Escape closes, Home/End jump.
 */
const GROUPS: { kind: CatalogEntry["kind"]; label: string }[] = [
  { kind: "readme", label: "Real project READMEs" },
  { kind: "test", label: "Test documents (each checks one behaviour)" },
  { kind: "approved", label: "Approved by review" },
  { kind: "used", label: "Used before" },
];

const matches = (e: CatalogEntry, q: string) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  // Every word must appear somewhere, so "elastic readme" finds it whatever the order.
  const hay = `${e.title} ${e.description} ${e.url}`.toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
};

export function DocumentPicker({
  catalog,
  loading,
  value,
  onChange,
}: {
  catalog: CatalogEntry[] | null;
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = catalog?.find((e) => e.id === value);
  // While the list is open the input holds what is being typed; closed, it shows what is chosen.
  const shown = open ? query : value === CUSTOM ? "Other: paste a URL…" : (selected?.title ?? "");

  const flat = useMemo(() => {
    const out: ({ group: string } | CatalogEntry)[] = [];
    for (const g of GROUPS) {
      const items = (catalog ?? []).filter((e) => e.kind === g.kind && matches(e, open ? query : ""));
      if (items.length) out.push({ group: g.label }, ...items);
    }
    return out;
  }, [catalog, query, open]);

  // Only the rows that can be picked; a group heading is not one.
  const options = useMemo(() => [...flat.filter((r): r is CatalogEntry => !("group" in r)).map((e) => e.id), CUSTOM], [flat]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, options.length - 1)));
  }, [options.length]);

  useEffect(() => {
    if (!open) return;
    const away = (ev: MouseEvent) => {
      if (!boxRef.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const pick = (optId: string) => {
    onChange(optId);
    setOpen(false);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!open) return setOpen(true);
      const step = ev.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + step + options.length) % options.length);
    } else if (ev.key === "Home" && open) {
      ev.preventDefault();
      setActive(0);
    } else if (ev.key === "End" && open) {
      ev.preventDefault();
      setActive(options.length - 1);
    } else if (ev.key === "Enter") {
      if (!open) return;
      ev.preventDefault();
      const optId = options[active];
      if (optId) pick(optId);
    } else if (ev.key === "Escape" && open) {
      ev.preventDefault();
      setOpen(false);
      setQuery("");
    }
  };

  let optionIndex = -1;
  return (
    <div className="combo" ref={boxRef}>
      <input
        ref={inputRef}
        id={`${id}-input`}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${id}-opt-${options[active]}` : undefined}
        autoComplete="off"
        disabled={loading}
        placeholder={loading ? "Loading documents…" : "Search or choose a document"}
        value={shown}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul className="combo-list" id={`${id}-list`} role="listbox" aria-label="Documents">
          {flat.map((row) =>
            "group" in row ? (
              <li key={row.group} className="combo-group" role="presentation">
                {row.group}
              </li>
            ) : (
              ((optionIndex += 1),
              (
                <li
                  key={row.id}
                  id={`${id}-opt-${row.id}`}
                  role="option"
                  aria-selected={row.id === value}
                  className={`combo-opt${optionIndex === active ? " active" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(row.id);
                  }}
                >
                  <span className="combo-title">{row.title}</span>
                  <span className="muted small break">{row.description}</span>
                </li>
              ))
            ),
          )}
          {((optionIndex += 1),
          (
            <li
              id={`${id}-opt-${CUSTOM}`}
              role="option"
              aria-selected={value === CUSTOM}
              className={`combo-opt${optionIndex === active ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(CUSTOM);
              }}
            >
              <span className="combo-title">Other: paste a URL…</span>
            </li>
          ))}
          {options.length === 1 && query.trim() !== "" && (
            <li className="combo-group" role="presentation">
              No document matches “{query.trim()}”.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
