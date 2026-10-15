"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { SessionRole } from "@/lib/session-token";

export function Shell({
  role,
  actorId,
  children,
}: {
  readonly role: SessionRole;
  readonly actorId: string | null;
  readonly children: React.ReactNode;
}) {
  const pathname = usePathname();
  const leaving = useRef(false);
  const [signingOut, setSigningOut] = useState(false);

  function leave(): void {
    if (leaving.current) return;
    leaving.current = true;
    // Soft navigation leaves the dashboard mounted, and its refresh loop keeps calling
    // router.refresh(), so the login page never replaces that client state.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  useEffect(() => {
    const onUnauthorized = () => {
      leave();
    };
    window.addEventListener("lp-unauthorized", onUnauthorized);
    return () => window.removeEventListener("lp-unauthorized", onUnauthorized);
  }, []);

  async function signOut(): Promise<void> {
    setSigningOut(true);
    const response = await fetch("/api/session", { method: "DELETE" });
    if (!response.ok) {
      setSigningOut(false);
      return;
    }
    leave();
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="masthead">
        <div>
          <p className="kicker">Livepeer builder</p>
          <p>
            <Link href="/dashboard" className="site-name">
              Enterprise desk
            </Link>
          </p>
        </div>
        <nav aria-label="Primary">
          <ul>
            <li>
              <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>
                Dashboard
              </Link>
            </li>
            {role === "operator" ? (
              <li>
                <Link href="/operator" aria-current={pathname === "/operator" ? "page" : undefined}>
                  Operator
                </Link>
              </li>
            ) : null}
            <li>
              <Link href="/iss-04" aria-current={pathname === "/iss-04" ? "page" : undefined}>
                ISS-04
              </Link>
            </li>
          </ul>
        </nav>
        <StatusPill />
        <div className="session">
          <p>
            <bdi>{actorId ?? "actor unknown"}</bdi>
          </p>
          <button type="button" className="quiet" disabled={signingOut} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}

function StatusPill() {
  const [text, setText] = useState("Checking engine");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function tick(): Promise<void> {
      const result = await api("/api/health");
      if (cancelled || !result.ok || !isRecord(result.body) || !isRecord(result.body.ready)) return;
      const ready = result.body.ready;
      const health = isRecord(ready.health) ? ready.health : null;
      const live = isRecord(result.body.live) ? result.body.live.ok === true : false;
      const readyOk = ready.status === 200 && health?.ready === true;
      setOk(live && readyOk);
      const version = typeof health?.version === "string" ? health.version : "engine";
      const discovery = health?.discovery_fresh === true ? "discovery fresh" : "discovery stale";
      setText(`${version} · ${discovery}`);
    }
    void tick();
    const timer = setInterval(() => void tick(), 30_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const state = ok === false ? "down" : ok === true ? "up" : "pending";
  return (
    <p className="status" data-state={state} role="status">
      {text}
    </p>
  );
}
