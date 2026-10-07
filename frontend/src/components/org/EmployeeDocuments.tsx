"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ACCEPTED_TYPES,
  addEmployeeDocument,
  DOCUMENT_CATEGORIES,
  fileDetail,
  getEmployeeDocuments,
  setUpEmployeeFolder,
  uploadProblem,
  type DocumentCategory,
  type DocumentFile,
} from "@/lib/org/documents";
import { useOrgResource } from "@/lib/org/useOrgResource";
import { ProfileSection } from "./ProfileParts";

/**
 * The Documents section of an employee profile. It loads on its own, so a Google Drive problem
 * only ever affects this section, never the rest of the profile. Files stay in Drive: "View"
 * and "Open folder" open them there.
 */
export function EmployeeDocuments({ staffId }: { staffId: string }) {
  const state = useOrgResource(() => getEmployeeDocuments(staffId), [staffId]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function setUp() {
    setBusy(true);
    setMessage(null);
    try {
      await setUpEmployeeFolder(staffId);
      state.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The folder couldn't be set up. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const data = state.status === "ready" ? state.data : null;
  const action =
    data?.status === "ok" ? (
      <button type="button" className="button" onClick={() => setAdding(true)}>
        + Add document
      </button>
    ) : undefined;

  return (
    <ProfileSection title="Documents" action={action}>
      {state.status === "loading" && <p className="profile-empty">Loading documents…</p>}
      {state.status === "error" && (
        <Notice text={state.error.isAuthError ? "Sign in again to see documents." : "Documents couldn't be loaded."} actionLabel="Try again" onAction={state.reload} />
      )}
      {data?.status === "not_configured" && <p className="profile-empty">Document storage isn&apos;t connected yet.</p>}
      {data?.status === "not_linked" && (
        <Notice text="This employee doesn't have a document folder yet." actionLabel={busy ? "Setting up…" : "Set up folder"} onAction={setUp} disabled={busy} />
      )}
      {data?.status === "folder_missing" && (
        <Notice
          text="This employee's folder can't be found in Google Drive. It may have been moved or deleted. Setting it up again links a new folder; nothing in Drive is deleted."
          actionLabel={busy ? "Setting up…" : "Set up folder again"}
          onAction={setUp}
          disabled={busy}
        />
      )}
      {data?.status === "unavailable" && <Notice text="Google Drive isn't responding right now." actionLabel="Try again" onAction={state.reload} />}
      {message && <p className="docs-error" role="alert">{message}</p>}

      {data?.status === "ok" && (
        <>
          {data.categories.every((c) => c.files.length === 0) && data.unfiled.length === 0 && <p className="profile-empty docs-none">No documents yet.</p>}
          {data.categories.map((c) =>
            c.locked ? (
              <div key={c.key} className="docs-group">
                <h3 className="docs-group-label">{c.label}</h3>
                <p className="docs-locked">
                  <span aria-hidden="true">🔒</span> Only HR can see {c.label.toLowerCase()}.
                </p>
              </div>
            ) : (
              <FileGroup key={c.key} label={c.label} files={c.files} />
            ),
          )}
          {data.unfiled.length > 0 && <FileGroup label="In the folder" files={data.unfiled} />}
          {data.missingSubfolders.length > 0 && (
            <p className="profile-note">
              Missing {data.missingSubfolders.map((k) => DOCUMENT_CATEGORIES.find((c) => c.key === k)!.label).join(", ")} folder.{" "}
              <button type="button" className="docs-inline-action" onClick={setUp} disabled={busy}>
                Add it back
              </button>
            </p>
          )}
          {data.folderUrl && (
            <div className="docs-foot">
              <a className="text-link" href={data.folderUrl} target="_blank" rel="noreferrer">
                Open folder ↗
              </a>
            </div>
          )}
        </>
      )}

      {adding && (
        <AddDocument
          staffId={staffId}
          categories={DOCUMENT_CATEGORIES.filter((c) => !(data?.status === "ok" && data.categories.find((x) => x.key === c.key)?.locked))}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            state.reload();
          }}
        />
      )}
    </ProfileSection>
  );
}

function Notice({ text, actionLabel, onAction, disabled }: { text: string; actionLabel: string; onAction: () => void; disabled?: boolean }) {
  return (
    <div className="docs-notice">
      <p className="profile-empty">{text}</p>
      <button type="button" className="button" onClick={onAction} disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}

function FileGroup({ label, files }: { label: string; files: DocumentFile[] }) {
  return (
    <div className="docs-group">
      <h3 className="docs-group-label">{label}</h3>
      {files.length === 0 ? (
        <p className="docs-group-empty">None</p>
      ) : (
        <ul className="docs-files">
          {files.map((f) => (
            <li key={f.id}>
              <a href={f.url} target="_blank" rel="noreferrer" className="docs-file">
                <span className="docs-file-name" title={f.name}>
                  {f.name}
                </span>
                <span className="docs-file-detail">{fileDetail(f)}</span>
                <span className="docs-file-open" aria-hidden="true">
                  View ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddDocument({
  staffId,
  categories,
  onClose,
  onAdded,
}: {
  staffId: string;
  /** The folders this person may add to (no Contracts without HR). */
  categories: readonly (typeof DOCUMENT_CATEGORIES)[number][];
  onClose: () => void;
  onAdded: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = uploadProblem(file, category);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addEmployeeDocument(staffId, category!, file!);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The file couldn't be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="editor" aria-labelledby="doc-title" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <form onSubmit={submit} noValidate>
        <div className="editor-head">
          <h2 id="doc-title">Add document</h2>
          <button type="button" className="editor-close" onClick={onClose} aria-label="Close" disabled={busy}>
            ×
          </button>
        </div>
        <div className="field">
          <label htmlFor="doc-file">File</label>
          <input id="doc-file" type="file" accept={ACCEPTED_TYPES} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} disabled={busy} />
          <span className="field-hint">PDF, image, Word, Excel or text · 4 MB max. It&apos;s saved to the employee&apos;s Google Drive folder.</span>
        </div>
        <fieldset className="field">
          <legend>Folder</legend>
          <div className="segmented" role="group" aria-label="Folder">
            {categories.map((c) => (
              <button key={c.key} type="button" className="segment" aria-pressed={category === c.key} onClick={() => { setCategory(c.key); setError(null); }} disabled={busy}>
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <div className="editor-feedback is-blocking" role="alert">
            <p>{error}</p>
          </div>
        )}
        <div className="editor-actions">
          <span className="editor-actions-main">
            <button type="button" className="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button button-primary-sm" disabled={busy}>
              {busy ? "Adding…" : "Add document"}
            </button>
          </span>
        </div>
      </form>
    </dialog>
  );
}
