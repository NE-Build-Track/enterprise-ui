import { readyz, reservedProbes } from "@/lib/engine/api";
import { EngineRequestError, isRecord } from "@/lib/engine/errors";
import { actorCall, adminCall, publicCall } from "@/lib/engine/server";
import { buildEvidence, type EvidenceActor, type RepeatDemo } from "@/lib/evidence";
import { readBody, withSession } from "@/lib/http";
import type { ProbeRow } from "@/lib/probe";
import { actorSnapshots } from "@/lib/snapshots";

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withSession(async (session) => {
    const admin = adminCall();
    const health = await readyz(publicCall()).then(
      (ready) => ({ status: ready.status, body: ready.health }),
      (error: unknown) => ({
        error: error instanceof EngineRequestError ? error.message : "ready check failed",
      }),
    );
    const snapshots = await actorSnapshots(admin);
    const actors: EvidenceActor[] =
      session.role === "operator"
        ? snapshots.map(toActor)
        : snapshots.filter((row) => row.actorId === session.actorId).map(toActor);
    const reserved = await reservedProbes(actorCall(session.token));
    const document = buildEvidence({
      generatedAt: new Date().toISOString(),
      health,
      actors,
      reserved,
      probe: readProbe(body),
      repeat: readRepeat(body),
    });
    return Response.json(document);
  });
}

function toActor(row: Awaited<ReturnType<typeof actorSnapshots>>[number]): EvidenceActor {
  return {
    actorId: row.actorId,
    applicationId: row.applicationId,
    reconciliation: row.reconciliation.ok ? row.reconciliation.value : null,
    reconciliationError: row.reconciliation.ok ? null : row.reconciliation.error,
  };
}

function readProbe(body: unknown): ProbeRow[] {
  if (!isRecord(body) || !Array.isArray(body.probe)) return [];
  return body.probe.filter(isProbeRow).slice(0, 50);
}

function isProbeRow(value: unknown): value is ProbeRow {
  return (
    isRecord(value) &&
    typeof value.app === "string" &&
    (value.verdict === "accepted" || value.verdict === "payment_refused" || value.verdict === "other")
  );
}

function readRepeat(body: unknown): RepeatDemo | null {
  if (!isRecord(body) || !isRecord(body.repeat)) return null;
  const repeat = body.repeat;
  if (typeof repeat.operationRef !== "string") return null;
  if (typeof repeat.firstStatus !== "number" || typeof repeat.secondStatus !== "number") return null;
  return {
    operationRef: repeat.operationRef,
    firstStatus: repeat.firstStatus,
    secondStatus: repeat.secondStatus,
    spendBefore: typeof repeat.spendBefore === "string" ? repeat.spendBefore : null,
    spendAfter: typeof repeat.spendAfter === "string" ? repeat.spendAfter : null,
  };
}
