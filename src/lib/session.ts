import "server-only";

import { cookies } from "next/headers";

import { sessionSecret } from "./config";
import { openSession, sealSession, sessionKey, type SessionClaims } from "./session-token";

export const SESSION_COOKIE = "lp_session";

export async function readSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return openSession(raw, await sessionKey(sessionSecret()));
}

export async function writeSession(claims: SessionClaims): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sealSession(claims, await sessionKey(sessionSecret())), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
