"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { api } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const token = String(new FormData(event.currentTarget).get("token") ?? "").trim();
    const result = await api("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/dashboard");
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
            <h1>Sign in with an engine key</h1>
          </header>
          <p>
            Paste the <code>lpk_</code> actor key this desk issued. The engine checks it on every request.
          </p>
          <label htmlFor="access-key">
            Access key (required)
            <input
              id="access-key"
              name="token"
              type="password"
              autoComplete="off"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
            />
          </label>
          {error ? (
            <p id="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit">Sign in</button>
          <p>
            <a href="/signup">Issue a key for a provisioned actor</a>
          </p>
        </form>
      </main>
    </>
  );
}
