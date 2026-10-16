import { randomUUID } from "node:crypto";

import { applicationId } from "@/lib/config";
import {
  fundAllocation,
  provisionActor,
  revokeAllocation,
  rotateAllocationKey,
  setAllocationStatus,
} from "@/lib/engine/api";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { readBody, withOperator } from "@/lib/http";

const ACTIONS = ["provision", "fund", "pause", "resume", "revoke", "rotate"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withOperator(async () => {
    if (!isRecord(body) || !isAction(body.action)) {
      return Response.json({ error: "an allocation action is required" }, { status: 400 });
    }
    const actorId = typeof body.actorId === "string" ? body.actorId.trim() : "";
    if (!actorId) return Response.json({ error: "an actor id is required" }, { status: 400 });
    const target = { applicationId: applicationId(), actorId };
    const call = adminCall();
    if (body.action === "provision") {
      const amount = usdAmount(body.amount);
      if (!amount) return Response.json({ error: "amount must be a USD decimal" }, { status: 400 });
      const label = typeof body.label === "string" ? body.label.trim() : "";
      return Response.json(await provisionActor(call, { ...target, amount, label }));
    }
    if (body.action === "fund") {
      const amount = usdAmount(body.amount);
      if (!amount || isZero(amount)) return Response.json({ error: "fund amount must be a USD decimal above zero" }, { status: 400 });
      return Response.json(await fundAllocation(call, { ...target, amount, operationRef: randomUUID() }));
    }
    if (body.action === "pause" || body.action === "resume") {
      return Response.json(await setAllocationStatus(call, { ...target, status: body.action === "pause" ? "paused" : "active" }));
    }
    if (body.action === "revoke") return Response.json(await revokeAllocation(call, target));
    return Response.json(await rotateAllocationKey(call, { ...target, operationRef: randomUUID() }));
  });
}

function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTIONS.some((action) => action === value);
}

function usdAmount(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const amount = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) return null;
  return amount;
}

function isZero(amount: string): boolean {
  return /^0+(?:\.0+)?$/.test(amount);
}
