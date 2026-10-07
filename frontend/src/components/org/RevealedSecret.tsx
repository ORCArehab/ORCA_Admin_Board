"use client";

import { useEffect, useState } from "react";

/** How long a revealed password stays on screen. */
export const REVEAL_SECONDS = 30;

/**
 * A password revealed on request. The ORCA API records each reveal before answering; here the
 * value lives only in component state and disappears after REVEAL_SECONDS (or on Hide).
 */
export function useRevealedSecret(load: () => Promise<string>) {
  const [value, setValue] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (value === null) return;
    const timer = window.setTimeout(() => {
      if (secondsLeft <= 1) setValue(null);
      else setSecondsLeft(secondsLeft - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [value, secondsLeft]);

  async function reveal() {
    setBusy(true);
    setMessage(null);
    try {
      setValue(await load());
      setSecondsLeft(REVEAL_SECONDS);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The password couldn't be revealed.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Couldn't copy. Select the password instead.");
    }
  }

  return { value, secondsLeft, busy, message, setMessage, reveal, copy, hide: () => setValue(null) };
}

export type RevealedSecretState = ReturnType<typeof useRevealedSecret>;

/** The revealed value with Copy / Hide and the countdown, plus any status message. */
export function RevealedSecret({ secret }: { secret: RevealedSecretState }) {
  return (
    <>
      {secret.value !== null && (
        <span className="login-revealed">
          <code>{secret.value}</code>
          <button type="button" className="button button-quiet" onClick={secret.copy}>
            Copy
          </button>
          <button type="button" className="button button-quiet" onClick={secret.hide}>
            Hide
          </button>
          <span className="muted">Hides in {secret.secondsLeft}s</span>
        </span>
      )}
      {secret.message && (
        <span className="login-message" role="status">
          {secret.message}
        </span>
      )}
    </>
  );
}
