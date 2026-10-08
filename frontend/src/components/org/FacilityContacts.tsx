"use client";

import { useState, type FormEvent } from "react";
import { createContact, removeContact, updateContact } from "@/lib/org/api";
import { missingKeyRoles, phoneDisplay, sortContacts } from "@/lib/org/contacts";
import { DEFAULT_CONTACT_ROLES, type ContactInput, type FacilityContact } from "@/lib/org/types";
import { MailIcon, PhoneIcon } from "./Icons";

const OTHER = "__other__";

/**
 * Who to call at the facility: Administrator, DON, DOR, IT / EHR and so on. HIM and admins add,
 * edit and remove contacts; the facility's activity records each change. Key roles nobody is
 * recorded for are offered as one-click starting points.
 */
export function FacilityContacts({
  facilityId,
  contacts,
  roles = DEFAULT_CONTACT_ROLES,
  canEdit,
  onChanged,
}: {
  facilityId: string;
  contacts: FacilityContact[];
  roles?: string[];
  canEdit: boolean;
  onChanged: (contacts: FacilityContact[], message: string) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const sorted = sortContacts(contacts, roles);
  const missing = missingKeyRoles(contacts);

  return (
    <div className="contacts">
      {canEdit && (
        <div className="contacts-toolbar">
          {missing.length > 0 && !adding && (
            <p className="contacts-missing">
              <span className="muted">Not recorded yet:</span>
              {missing.map((role) => (
                <button key={role} type="button" className="chip-button" onClick={() => setAdding(role)}>
                  + {role}
                </button>
              ))}
            </p>
          )}
          {!adding && (
            <button type="button" className="button button-primary-sm" onClick={() => setAdding("")}>
              + Add contact
            </button>
          )}
        </div>
      )}
      {adding !== null && (
        <ContactForm
          roles={roles}
          contact={null}
          presetRole={adding}
          onCancel={() => setAdding(null)}
          onSave={async (input) => {
            const created = await createContact(facilityId, input);
            setAdding(null);
            onChanged([...contacts, created], `${created.role} contact added.`);
          }}
        />
      )}
      {sorted.length === 0 && adding === null ? (
        <p className="profile-empty">No contacts recorded for this facility yet.</p>
      ) : (
        <ul className="contact-cards">
          {sorted.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              roles={roles}
              canEdit={canEdit}
              onSave={async (changes) => {
                const updated = await updateContact(facilityId, c.id, changes);
                onChanged(contacts.map((x) => (x.id === c.id ? updated : x)), "Contact saved.");
              }}
              onRemove={async () => {
                await removeContact(facilityId, c.id);
                onChanged(contacts.filter((x) => x.id !== c.id), `${c.role} contact removed.`);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactCard({
  contact: c,
  roles,
  canEdit,
  onSave,
  onRemove,
}: {
  contact: FacilityContact;
  roles: string[];
  canEdit: boolean;
  onSave: (changes: ContactInput) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const phone = phoneDisplay(c);

  if (editing) {
    return (
      <li className="contact-card contact-card-editing">
        <ContactForm
          roles={roles}
          contact={c}
          presetRole={c.role}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            // Send only what changed, so the activity lists real changes.
            const changes = Object.fromEntries(Object.entries(input).filter(([k, v]) => ((c as unknown as Record<string, unknown>)[k] ?? null) !== v));
            if (Object.keys(changes).length) await onSave(changes);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className="contact-card">
      <div className="contact-head">
        <span className="contact-role">{c.role}</span>
        {canEdit && !confirming && (
          <span className="contact-actions">
            <button type="button" className="link-button text-link" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button type="button" className="link-button contact-remove" onClick={() => setConfirming(true)}>
              Remove
            </button>
          </span>
        )}
      </div>
      <p className="contact-name">{c.name ?? <span className="muted">No name recorded</span>}</p>
      {c.title && <p className="contact-title">{c.title}</p>}
      <div className="contact-lines">
        {phone && (
          <a href={phone.href} className="contact-line">
            <PhoneIcon /> {phone.text}
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className="contact-line">
            <MailIcon /> <span className="contact-email">{c.email}</span>
          </a>
        )}
      </div>
      {c.notes && <p className="contact-notes">{c.notes}</p>}
      {confirming && (
        <div className="access-delete-confirm" role="alert">
          Remove {c.name ?? "this contact"} ({c.role}) from this facility?
          <span className="access-delete-actions">
            <button type="button" className="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await onRemove();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Couldn't remove.");
                  setBusy(false);
                }
              }}
            >
              {busy ? "Removing…" : "Remove contact"}
            </button>
          </span>
          {error && <span className="record-error">{error}</span>}
        </div>
      )}
    </li>
  );
}

function ContactForm({
  roles,
  contact,
  presetRole,
  onCancel,
  onSave,
}: {
  roles: string[];
  contact: FacilityContact | null;
  presetRole: string;
  onCancel: () => void;
  onSave: (input: ContactInput) => Promise<void>;
}) {
  const standard = roles.includes(presetRole);
  const [role, setRole] = useState(presetRole === "" ? roles[0] ?? OTHER : standard ? presetRole : OTHER);
  const [customRole, setCustomRole] = useState(standard ? "" : presetRole);
  const [name, setName] = useState(contact?.name ?? "");
  const [title, setTitle] = useState(contact?.title ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [extension, setExtension] = useState(contact?.extension ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `contact-${contact?.id ?? "new"}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = (v: string) => (v.trim() === "" ? null : v.trim());
    const chosenRole = role === OTHER ? customRole.trim() : role;
    if (!chosenRole) return setError("Enter the role.");
    if (!text(name) && !text(phone) && !text(email)) return setError("Enter a name, phone or email.");
    setBusy(true);
    setError(null);
    try {
      await onSave({ role: chosenRole, name: text(name), title: text(title), phone: text(phone), extension: text(extension), email: text(email), notes: text(notes) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form className="contact-form" onSubmit={submit} noValidate>
      <div className="contact-form-grid">
        <div className="field">
          <label htmlFor={`${id}-role`}>Role</label>
          <select id={`${id}-role`} value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </select>
        </div>
        {role === OTHER && (
          <div className="field">
            <label htmlFor={`${id}-custom`}>Role name</label>
            <input id={`${id}-custom`} value={customRole} onChange={(e) => setCustomRole(e.target.value)} maxLength={80} placeholder="e.g. Wound Care Nurse" />
          </div>
        )}
        <div className="field">
          <label htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-title`}>Title</label>
          <input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Director of Nursing" />
        </div>
        <div className="field contact-phone-field">
          <label htmlFor={`${id}-phone`}>Direct phone</label>
          <span className="contact-phone-inputs">
            <input id={`${id}-phone`} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
            <input aria-label="Extension" value={extension} onChange={(e) => setExtension(e.target.value)} maxLength={20} placeholder="Ext." />
          </span>
        </div>
        <div className="field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
        </div>
        <div className="field record-wide">
          <label htmlFor={`${id}-notes`}>Notes</label>
          <textarea id={`${id}-notes`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="e.g. Best reached after 2pm. Never patient information." />
        </div>
      </div>
      {error && (
        <span className="record-error" role="alert">
          {error}
        </span>
      )}
      <div className="category-actions">
        <button type="button" className="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="button button-primary-sm" disabled={busy}>
          {busy ? "Saving…" : contact ? "Save" : "Add contact"}
        </button>
      </div>
    </form>
  );
}
