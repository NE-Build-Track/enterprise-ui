import { allowance, listKeys } from "./engine/api";
import { createEngineCall, type EngineCall } from "./engine/client";
import { EngineRequestError } from "./engine/errors";
import { lookupKey } from "./registry";
import type { SessionClaims } from "./session-token";

export type LoginResult = SessionClaims & {
  readonly provisioned: boolean;
};

export async function authenticateKey(baseUrl: string, token: string): Promise<LoginResult> {
  if (!token.startsWith("lpk_")) {
    throw new EngineRequestError(401, "an engine access key is required", emptyDetails());
  }
  const call = createEngineCall(baseUrl, token);
  const provisioned = await probeAllowance(call);
  const role = await probeRole(call);
  const record = await lookupKey(token);
  return {
    token,
    role,
    provisioned,
    actorId: record?.actorId ?? null,
    applicationId: record?.applicationId ?? "default",
    keyId: record?.keyId ?? null,
  };
}

async function probeAllowance(call: EngineCall): Promise<boolean> {
  try {
    await allowance(call);
    return true;
  } catch (error) {
    if (error instanceof EngineRequestError && error.status === 404) return false;
    throw error;
  }
}

async function probeRole(call: EngineCall): Promise<"actor" | "operator"> {
  try {
    await listKeys(call);
    return "operator";
  } catch (error) {
    if (error instanceof EngineRequestError && error.status === 403) return "actor";
    throw error;
  }
}

function emptyDetails() {
  return { job: null, retryAfter: null, jobId: null, milestone: null, ticket: null };
}
