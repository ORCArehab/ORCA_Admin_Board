"use client";

import { useState, type FormEvent } from "react";
import { OrgError } from "@/lib/org/api";
import { missingRequired, toPayload, type FieldDef, type FormValues, type SectionDef } from "@/lib/org/form";
import type { FieldError } from "@/lib/org/types";

/**
 * A staff or facility record as a form, in sections. Errors the ORCA API names by field show
 * under that field; anything else shows above the Save button. `initial` null means a new record.
 */
export function RecordForm({
  sections,
  initial,
  defaults,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  sections: SectionDef[];
  initial: FormValues | null;
  defaults: FormValues;
  submitLabel: string;
  /** Receives the payload; resolves with the saved record's values, or throws an OrgError. */
  onSubmit: (payload: Record<string, unknown>) => Promise<FormValues | void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<FormValues>(() => initial ?? defaults);
  const [baseline, setBaseline] = useState<FormValues | null>(initial);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [message, setMessage] = useState<{ kind: "error" | "saved"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const payload = toPayload(sections, values, baseline);
  const dirty = Object.keys(payload).length > 0;

  function set(name: string, value: string | boolean) {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => e.filter((x) => x.field !== name));
    setMessage(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const missing = missingRequired(sections, values);
    if (missing.length > 0) {
      setErrors(missing);
      setMessage({ kind: "error", text: "Fill in the required fields." });
      return;
    }
    if (baseline && !dirty) return;
    setBusy(true);
    setMessage(null);
    try {
      const saved = await onSubmit(payload);
      if (saved) {
        setValues(saved);
        setBaseline(saved);
      }
      setErrors([]);
      if (baseline) setMessage({ kind: "saved", text: "Saved." });
    } catch (error) {
      const fieldErrors = error instanceof OrgError ? error.fieldErrors : [];
      const known = new Set(sections.flatMap((s) => s.fields.map((f) => f.name)));
      setErrors(fieldErrors);
      const unplaced = fieldErrors.filter((f) => !known.has(f.field));
      setMessage({
        kind: "error",
        text:
          fieldErrors.length > 0 && unplaced.length === 0
            ? "Some fields need attention."
            : unplaced.length > 0
              ? unplaced.map((f) => f.message).join(" ")
              : error instanceof Error
                ? error.message
                : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  }

  const errorFor = (name: string) => errors.find((e) => e.field === name)?.message;

  return (
    <form className="record-form" onSubmit={submit} noValidate>
      {sections.map((section) => (
        <fieldset className="panel record-section" key={section.title}>
          <legend>{section.title}</legend>
          <div className="record-grid">
            {section.fields.map((field) => (
              <Field key={field.name} field={field} value={values[field.name]} error={errorFor(field.name)} onChange={(v) => set(field.name, v)} />
            ))}
          </div>
        </fieldset>
      ))}

      <div className="record-actions">
        {message && (
          <span className={message.kind === "saved" ? "record-saved" : "record-error"} role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </span>
        )}
        <div className="editor-actions-main">
          {onCancel && (
            <button type="button" className="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
          {baseline && dirty && (
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setValues(baseline);
                setErrors([]);
                setMessage(null);
              }}
              disabled={busy}
            >
              Discard changes
            </button>
          )}
          <button type="submit" className="button button-primary-sm" disabled={busy || (!!baseline && !dirty)}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({ field, value, error, onChange }: { field: FieldDef; value: string | boolean | undefined; error?: string; onChange: (value: string | boolean) => void }) {
  const id = `f-${field.name.replace(/\./g, "-")}`;
  const describedBy = [error && `${id}-error`, field.hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  const common = { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy };

  if (field.kind === "checkbox") {
    return (
      <div className={`field record-wide${error ? " has-error" : ""}`}>
        <label className="check">
          <input type="checkbox" {...common} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {field.label}
        </label>
        {field.hint && <span className="field-hint" id={`${id}-hint`}>{field.hint}</span>}
        {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
      </div>
    );
  }

  const text = typeof value === "string" ? value : "";
  return (
    <div className={`field${field.wide ? " record-wide" : ""}${error ? " has-error" : ""}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="required" aria-hidden="true"> *</span>}
      </label>
      {field.kind === "select" ? (
        <select {...common} value={text} onChange={(e) => onChange(e.target.value)}>
          {/* A value the app doesn't know yet still shows, rather than silently changing on save. */}
          {text && !(text in (field.options ?? {})) && <option value={text}>{text}</option>}
          {Object.entries(field.options ?? {}).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.kind === "date" ? "date" : field.kind === "email" ? "email" : "text"}
          value={text}
          required={field.required}
          placeholder={field.placeholder}
          autoComplete={field.autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {field.hint && <span className="field-hint" id={`${id}-hint`}>{field.hint}</span>}
      {error && <span className="field-error" id={`${id}-error`}>{error}</span>}
    </div>
  );
}
