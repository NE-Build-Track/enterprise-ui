import "server-only";

import { issueKey, reconcile, revokeKey } from "./engine/api";
import type { EngineCall } from "./engine/client";
import { EngineRequestError } from "./engine/errors";
import type { IssuedKey } from "./engine/types";
import { rememberKey } from "./registry";

export async function issueActorKey(
  admin: EngineCall,
  input: { actorId: string; applicationId: string; label: string },
): Promise<IssuedKey> {
  const actorId = input.actorId.trim();
  if (!actorId) {
    throw new EngineRequestError(400, "an actor id is required", emptyDetails());
  }
  const issued = await issueKey(admin, {
    kind: "actor",
    actor_id: actorId,
    application_id: input.applicationId,
    label: input.label.trim() || actorId,
    permissions: null,
  });
  try {
    await reconcile(admin, { applicationId: input.applicationId, actorId });
  } catch (error) {
    await revokeQuietly(admin, issued.key.key_id);
    if (error instanceof EngineRequestError && error.status === 404) {
      throw new EngineRequestError(
        404,
        `actor ${actorId} has no allocation; provision it before issuing a key`,
        emptyDetails(),
      );
    }
    throw error;
  }
  try {
    await rememberKey(issued.token, {
      keyId: issued.key.key_id,
      actorId,
      applicationId: input.applicationId,
      kind: issued.key.kind,
      label: issued.key.label,
      issuedAt: issued.key.created_at,
    });
  } catch (error) {
    await revokeQuietly(admin, issued.key.key_id);
    throw error;
  }
  return issued;
}

async function revokeQuietly(admin: EngineCall, keyId: string): Promise<void> {
  try {
    await revokeKey(admin, keyId);
  } catch {
    // The caller reports the original failure. A revoke miss is surfaced by the next login.
  }
}

function emptyDetails() {
  return { job: null, retryAfter: null, jobId: null, milestone: null, ticket: null };
}
