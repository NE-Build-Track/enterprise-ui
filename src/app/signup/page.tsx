"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";

import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  const dismiss = useCallback(() => {
    setToken("");
    setCopied(false);
    setCopyError("");
  }, []);

  useEffect(() => {
    const drop = () => {
      flushSync(dismiss);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) drop();
    };
    window.addEventListener("pagehide", drop);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", drop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [dismiss]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await api("/api/signup", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inviteCode: String(data.get("inviteCode") ?? ""),
        actorId: String(data.get("actorId") ?? ""),
        label: String(data.get("label") ?? ""),
      }),
    });
    if (!result.ok || !isRecord(result.body) || typeof result.body.token !== "string") {
      setError(result.ok ? "No key was returned." : result.error);
      return;
    }
    setToken(result.body.token);
    setCopied(false);
    setCopyError("");
    setError("");
  }

  async function copyKey(): Promise<void> {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setCopyError("");
    } catch (cause) {
      setCopied(false);
      setCopyError(cause instanceof Error ? cause.message : "The key could not be copied.");
    }
    document.getElementById("issued-key")?.focus();
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <main id="main" className="gate" tabIndex={-1}>
        <form className="panel" onSubmit={(event) => void onSubmit(event)}>
          <header>
            <p className="kicker">Livepeer builder</p>
            <h1>Issue an actor key</h1>
          </header>
          <p>The actor id must already have an allocation on the shared grant. This does not move money.</p>
          <label htmlFor="invite-code">
            Invite code (required)
            <input id="invite-code" name="inviteCode" autoComplete="off" required aria-describedby={error ? "signup-error" : undefined} />
          </label>
          <label htmlFor="actor-id">
            Actor id (required)
            <input id="actor-id" name="actorId" autoComplete="off" required />
          </label>
          <label htmlFor="key-label">
            Label (optional)
            <input id="key-label" name="label" autoComplete="off" />
          </label>
          {error ? (
            <p id="signup-error" role="alert">
              {error}
            </p>
          ) : null}
          {token ? (
            <div className="once">
              <p id="issued-note">Shown once. Copy this key, then close it. It is not saved in the browser.</p>
              <div className="once-row">
                <input
                  id="issued-key"
                  className="secret"
                  readOnly
                  value={token}
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  translate="no"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                  data-form-type="other"
                  aria-labelledby="issued-note"
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                />
                <button type="button" onClick={() => void copyKey()}>
                  Copy
                </button>
                <button type="button" className="quiet" onClick={dismiss}>
                  Close
                </button>
              </div>
              {copied ? <p role="status">Copied.</p> : null}
              {copyError ? <p role="alert">{copyError}</p> : null}
            </div>
          ) : null}
          <button type="submit">Issue key</button>
          <p>
            <a href="/login">Back to sign in</a>
          </p>
        </form>
      </main>
    </>
  );
}
