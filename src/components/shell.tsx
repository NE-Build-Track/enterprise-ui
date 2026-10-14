"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onUnauthorized = () => {
      router.push("/login");
      router.refresh();
    };
    window.addEventListener("lp-unauthorized", onUnauthorized);
    return () => window.removeEventListener("lp-unauthorized", onUnauthorized);
  }, [router]);

  async function signOut(): Promise<void> {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/login");
    router.refresh();
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
          <button type="button" className="quiet" onClick={() => void signOut()}>
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
