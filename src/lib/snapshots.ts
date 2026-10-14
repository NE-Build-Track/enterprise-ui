import "server-only";

import { actorsFromKeys, type ActorSnapshot, type FieldResult } from "./attribution";
import { allowance, costSummary, listKeys, reconcile } from "./engine/api";
import type { EngineCall } from "./engine/client";
import { EngineRequestError } from "./engine/errors";
import { defaultCostWindow } from "./money";

export type { ActorSnapshot, FieldResult } from "./attribution";

export async function actorSnapshots(
  admin: EngineCall,
  window: { start: string; end: string } = defaultCostWindow(),
): Promise<ActorSnapshot[]> {
  const actors = actorsFromKeys(await listKeys(admin));
  return Promise.all(
    actors.map(async (actor) => ({
      ...actor,
      allowance: await capture(allowance(admin, actor.actorId)),
      summary: await capture(
        costSummary(admin, { start: window.start, end: window.end, actorId: actor.actorId }),
      ),
      reconciliation: await capture(
        reconcile(admin, { applicationId: actor.applicationId, actorId: actor.actorId }),
      ),
    })),
  );
}

async function capture<T>(work: Promise<T>): Promise<FieldResult<T>> {
  try {
    return { ok: true, value: await work };
  } catch (error) {
    if (error instanceof EngineRequestError) {
      return { ok: false, status: error.status, error: error.message };
    }
    throw error;
  }
}
