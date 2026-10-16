"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
    // Soft navigation leaves the console mounted, and its refresh loop keeps calling
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
            <Link href="/overview" className="site-name">
              Enterprise desk
            </Link>
          </p>
        </div>
        <nav aria-label="Primary">
          <ul>
            <li>
              <Link href="/overview" aria-current={pathname === "/overview" ? "page" : undefined}>
                Overview
              </Link>
            </li>
            <li>
              <Link href="/jobs" aria-current={pathname === "/jobs" || (pathname.startsWith("/jobs/") && pathname !== "/jobs/new") ? "page" : undefined}>
                Jobs
              </Link>
            </li>
            <li>
              <Link href="/billing" aria-current={pathname === "/billing" ? "page" : undefined}>
                Billing
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
              <Link href="/checks" aria-current={pathname === "/checks" ? "page" : undefined}>
                Checks
              </Link>
            </li>
          </ul>
        </nav>
        <Link href="/jobs/new" className="primary" aria-current={pathname === "/jobs/new" ? "page" : undefined}>
          New job
        </Link>
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

