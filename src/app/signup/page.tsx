"use client";

import { useState, type FormEvent } from "react";

import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const result = await api("/api/signup", {
      method: "POST",
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
    setError("");
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
            <p role="status">
              Shown once. Sign in with <code>{token}</code>
            </p>
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
