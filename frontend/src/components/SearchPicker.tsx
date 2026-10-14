"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { rankOptions, type PickerOption } from "@/lib/search";

/**
 * A search box for choosing one record (an employee, a facility, a QuickBooks Time user...).
 * Nothing is listed until something is typed; then the closest few matches appear. The options
 * are loaded only when the box is first used. Keyboard: arrows to move, Enter to choose, Escape to close.
 */
export function SearchPicker({
  value,
  valueLabel,
  load,
  onChange,
  placeholder = "Search…",
  ariaLabel,
  disabled = false,
  limit = 8,
}: {
  value: string | null;
  /** The chosen option's name, shown while the box isn't being typed in. */
  valueLabel?: string | null;
  load: () => Promise<PickerOption[]>;
  onChange: (option: PickerOption) => void;
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  limit?: number;
}) {
  const listId = useId();
  const [options, setOptions] = useState<PickerOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // The label picked here, for the value it was picked for (a new value from outside wins).
  const [chosen, setChosen] = useState<PickerOption | null>(null);
  const loading = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function ensureLoaded() {
    if (options || loading.current) return;
    loading.current = true;
    load().then(
      (list) => setOptions(list),
      () => setFailed(true),
    );
  }

  const results = open && query.trim() && options ? rankOptions(options, query, limit) : [];
  const shown = (chosen && chosen.id === value ? chosen.label : null) ?? valueLabel ?? (value ? options?.find((o) => o.id === value)?.label : null) ?? "";

  function choose(option: PickerOption) {
    setChosen(option);
    setQuery("");
    setOpen(false);
    onChange(option);
    inputRef.current?.blur();
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[active];
      if (pick) choose(pick);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="search-picker">
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={results[active] ? `${listId}-${results[active]!.id}` : undefined}
        className="search-picker-input"
        value={open ? query : shown}
        placeholder={shown || placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => {
          ensureLoaded();
          setOpen(true);
          setQuery("");
          setActive(0);
        }}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKey}
      />
      {open && query.trim() && (
        <ul id={listId} role="listbox" className="search-picker-list">
          {failed ? (
            <li className="search-picker-empty">The list couldn&apos;t be loaded.</li>
          ) : !options ? (
            <li className="search-picker-empty">Loading…</li>
          ) : results.length === 0 ? (
            <li className="search-picker-empty">No matches for &ldquo;{query.trim()}&rdquo;</li>
          ) : (
            results.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${o.id}`}
                role="option"
                aria-selected={i === active}
                className={`search-picker-option${i === active ? " is-active" : ""}`}
                // Choose before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{o.label}</span>
                {o.detail && <span className="search-picker-detail">{o.detail}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
