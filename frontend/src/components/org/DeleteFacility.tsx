"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRoles } from "@/components/RolesProvider";
import { canManageAccess } from "@/lib/access";
import { deleteFacility } from "@/lib/org/api";

/**
 * Admins only: permanently delete a facility that was added by mistake or is a duplicate. The
 * ORCA API refuses if it has provider assignments, schedule entries or hospital logins, and the
 * reason is shown here; archiving (in the form above) is the way to retire a real facility.
 */
export function DeleteFacility({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const roles = useRoles();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canManageAccess(roles)) return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await deleteFacility(id);
      router.push("/facilities");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The facility couldn't be deleted.");
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <section className="danger-zone" aria-labelledby="delete-facility-title">
      <h2 id="delete-facility-title">Delete facility</h2>
      <p>
        For a facility added by mistake or a duplicate. It&apos;s removed permanently, with its contacts and other names. A facility with provider assignments, schedule entries or hospital
        logins can&apos;t be deleted; archive it instead.
      </p>
      {error && (
        <p className="record-error" role="alert">
          {error}
        </p>
      )}
      {confirming ? (
        <div className="access-delete-confirm" role="alert">
          Permanently delete {name}? This can&apos;t be undone.
          <span className="access-delete-actions">
            <button type="button" className="button" onClick={() => setConfirming(false)} disabled={busy}>
              Keep it
            </button>
            <button type="button" className="button button-danger" onClick={confirm} disabled={busy}>
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          </span>
        </div>
      ) : (
        <button type="button" className="button button-danger" onClick={() => setConfirming(true)}>
          Delete facility…
        </button>
      )}
    </section>
  );
}
