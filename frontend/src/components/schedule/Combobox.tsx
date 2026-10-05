"use client";

import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { searchOptions, type SearchOption, type SearchResult } from "@/lib/schedule/search";

/**
 * A type-to-search box: typing (or ↓) opens the list and any part of any name narrows it, ↑/↓ moves, Enter picks the
 * highlighted (first, by default) result, Escape closes the list (and, if it's already closed,
 * lets the Escape through to whatever contains the box). Mouse picking works as usual.
 */
export function Combobox({
  label,
  options,
  value,
  onPick,
  onEscape,
  placeholder,
  inputRef,
  autoFocus,
  limit = 8,
}: {
  label: string;
  options: SearchOption[];
  /** The picked option, shown in the box until the text changes. */
  value: SearchOption | null;
  onPick: (option: SearchOption | null) => void;
  onEscape?: () => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  limit?: number;
}) {
  const id = useId();
  const [query, setQuery] = useState(value?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // Showing the picked option's label isn't a search for it.
  const searching = !value || query !== value.label;
  const results: SearchResult[] = useMemo(() => searchOptions(options, searching ? query : "", limit), [options, query, searching, limit]);
  const listOpen = open && results.length > 0;
  const optionId = (i: number) => `${id}-opt-${i}`;

  function pick(result: SearchResult | undefined) {
    if (!result) return;
    setQuery(result.option.label);
    setOpen(false);
    onPick(result.option);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!listOpen) {
        setOpen(true);
        setActive(0);
        return;
      }
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % results.length : (i - 1 + results.length) % results.length));
    } else if (e.key === "Enter") {
      // Enter with a typed search takes the highlighted result. With nothing new typed it
      // re-confirms the current pick, so a form can treat it as "go".
      if (listOpen && searching) {
        e.preventDefault();
        pick(results[active]);
      } else if (value && !searching) {
        e.preventDefault();
        onPick(value);
      }
    } else if (e.key === "Escape") {
      if (listOpen) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      } else {
        onEscape?.();
      }
    }
  }

  return (
    <div className="combo">
      <label className="sr-only" htmlFor={`${id}-input`}>
        {label}
      </label>
      <input
        id={`${id}-input`}
        ref={inputRef}
        className="combo-input"
        type="text"
        role="combobox"
        aria-expanded={listOpen}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={listOpen ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder ?? label}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (value) onPick(null);
        }}
        // The list opens on typing, ↓ or a click, not on focus: on open it would cover the controls below.
        onMouseDown={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {listOpen && (
        <ul className="combo-list" id={`${id}-list`} role="listbox" aria-label={label}>
          {results.map((r, i) => (
            <li
              key={`${r.option.kind}:${r.option.id}`}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              className={`combo-option${i === active ? " is-active" : ""}${r.option.kind === "special" ? " is-special" : ""}`}
              // Keep focus in the box, so picking with the mouse doesn't blur and close it first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span className="combo-label">{r.option.label}</span>
              {(r.matched || r.option.detail) && <span className="combo-detail">{r.matched ? `“${r.matched}”` : r.option.detail}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && searching && query.trim() && results.length === 0 && (
        <div className="combo-empty" role="status">
          No match for “{query.trim()}”
        </div>
      )}
    </div>
  );
}
