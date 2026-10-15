import { allowance, listKeys } from "./engine/api";
import type { EngineCall } from "./engine/client";
import { EngineRequestError } from "./engine/errors";
import { lookupKey } from "./registry";

export type ResolvedActor = {
  readonly actorId: string;
  readonly applicationId: string;
};

export async function resolveActor(
  user: EngineCall,
  admin: EngineCall,
  token: string,
  known: { readonly actorId: string | null; readonly applicationId: string },
): Promise<ResolvedActor | null> {
  if (known.actorId) return { actorId: known.actorId, applicationId: known.applicationId };
  const record = await lookupKey(token);
  if (record) return { actorId: record.actorId, applicationId: record.applicationId };
  return actorForAllocation(user, admin);
}

async function actorForAllocation(user: EngineCall, admin: EngineCall): Promise<ResolvedActor | null> {
  let mine;
  try {
    mine = await allowance(user);
  } catch (error) {
    if (error instanceof EngineRequestError) return null;
    throw error;
  }
  const keys = await listKeys(admin);
  const candidates = new Map<string, ResolvedActor>();
  for (const key of keys) {
    if (key.revoked_at !== null) continue;
    const id = `${key.application_id}\u0000${key.actor_id}`;
    if (!candidates.has(id)) candidates.set(id, { actorId: key.actor_id, applicationId: key.application_id });
  }
  const checks = await Promise.all(
    [...candidates.values()].map(async (candidate) => {
      try {
        const row = await allowance(admin, candidate.actorId);
        return row.allocation_id === mine.allocation_id ? candidate : null;
      } catch (error) {
        if (error instanceof EngineRequestError) return null;
        throw error;
      }
    }),
  );
  const matches = checks.filter((row): row is ResolvedActor => row !== null);
  const distinct = new Map(matches.map((row) => [`${row.applicationId}\u0000${row.actorId}`, row]));
  if (distinct.size !== 1) return null;
  return [...distinct.values()][0];
}
