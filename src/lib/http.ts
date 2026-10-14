import "server-only";

import { EngineRequestError } from "./engine/errors";
import { clearSession, readSession } from "./session";
import type { SessionClaims } from "./session-token";

export async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function requireApiSession(): Promise<SessionClaims | Response> {
  const session = await readSession();
  if (!session) return Response.json({ error: "a credential is required" }, { status: 401 });
  return session;
}

export function isResponse(value: SessionClaims | Response): value is Response {
  return value instanceof Response;
}

export async function engineFailure(error: unknown): Promise<Response> {
  if (error instanceof EngineRequestError) {
    if (error.status === 401) await clearSession();
    return Response.json(
      {
        error: error.message,
        job: error.job,
        milestone: error.milestone,
        ticket: error.ticket,
        retryAfter: error.retryAfter,
        jobId: error.jobId,
      },
      {
        status: error.status,
        headers: error.retryAfter ? { "Retry-After": error.retryAfter } : undefined,
      },
    );
  }
  const message = error instanceof Error ? error.message : "request failed";
  return Response.json({ error: message }, { status: 500 });
}

export async function withSession(
  handler: (session: SessionClaims) => Promise<Response>,
): Promise<Response> {
  try {
    const session = await requireApiSession();
    if (isResponse(session)) return session;
    return await handler(session);
  } catch (error) {
    return engineFailure(error);
  }
}

export async function withOperator(
  handler: (session: SessionClaims) => Promise<Response>,
): Promise<Response> {
  return withSession(async (session) => {
    if (session.role !== "operator") {
      return Response.json({ error: "an admin credential is required" }, { status: 403 });
    }
    return handler(session);
  });
}
