/**
 * A record form described as data: which fields, how each is edited, and how the form's
 * values become the JSON the ORCA API takes. Field names are the API's, with nested ones
 * dotted ("address.city"), which is also how the API names a field it refuses.
 */

export interface FieldDef {
  name: string;
  label: string;
  kind?: "text" | "email" | "date" | "select" | "checkbox";
  options?: Record<string, string>;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  /** Takes the full row in a two-column layout. */
  wide?: boolean;
  autoComplete?: string;
}

export interface SectionDef {
  title: string;
  fields: FieldDef[];
}

export type FormValues = Record<string, string | boolean>;

function read(record: unknown, name: string): unknown {
  return name.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), record);
}

/** A record's values as form inputs: text as strings (null → ""), checkboxes as booleans. */
export function toFormValues(sections: SectionDef[], record: unknown, defaults: FormValues = {}): FormValues {
  const values: FormValues = {};
  for (const field of sections.flatMap((s) => s.fields)) {
    const value = record === null ? defaults[field.name] : read(record, field.name);
    values[field.name] = field.kind === "checkbox" ? value === true || (value === undefined && defaults[field.name] === true) : typeof value === "string" ? value : (defaults[field.name] as string | undefined) ?? "";
  }
  return values;
}

const normalize = (field: FieldDef, value: string | boolean | undefined) =>
  field.kind === "checkbox" ? value === true : typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * The JSON to send. For a new record, every field with a value. For an edit, only the fields
 * that changed (a cleared field is sent as null), so the API's own rules for untouched fields
 * apply: a display name nobody edited keeps following the name.
 */
export function toPayload(sections: SectionDef[], values: FormValues, initial: FormValues | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of sections.flatMap((s) => s.fields)) {
    const value = normalize(field, values[field.name]);
    if (initial ? value === normalize(field, initial[field.name]) : value === null) continue;
    const keys = field.name.split(".");
    let target = payload;
    for (const key of keys.slice(0, -1)) target = (target[key] ??= {}) as Record<string, unknown>;
    target[keys.at(-1)!] = value;
  }
  return payload;
}

/** Required fields left empty, as the API would name them. */
export function missingRequired(sections: SectionDef[], values: FormValues) {
  return sections
    .flatMap((s) => s.fields)
    .filter((f) => f.required && normalize(f, values[f.name]) === null)
    .map((f) => ({ field: f.name, message: `${f.label} is required` }));
}
