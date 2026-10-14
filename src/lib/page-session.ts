import "server-only";

import { redirect } from "next/navigation";

import { readSession } from "./session";
import type { SessionClaims } from "./session-token";

export async function requirePageSession(): Promise<SessionClaims> {
  const session = await readSession();
  if (!session) redirect("/login");
  return session;
}
