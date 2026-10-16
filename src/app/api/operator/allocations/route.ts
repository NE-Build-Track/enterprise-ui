import { randomUUID } from "node:crypto";

import { applicationId } from "@/lib/config";
import {
  fundAllocation,
  provisionActor,
  revokeAllocation,
  rotateAllocationKey,
  setAllocationStatus,
  type AllocationTarget,
} from "@/lib/engine/api";
import type { EngineCall } from "@/lib/engine/client";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { readBody, withOperator } from "@/lib/http";

const ACTIONS = ["provision", "fund", "pause", "resume", "revoke", "rotate"] as const;
type Action = (typeof ACTIONS)[number];
type AllocationBody = Record<string, unknown>;

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withOperator(() => allocationResponse(body));
}

async function allocationResponse(body: unknown): Promise<Response> {
  if (!isRecord(body) || !isAction(body.action)) {
    return Response.json({ error: "an allocation action is required" }, { status: 400 });
  }
  const actorId = typeof body.actorId === "string" ? body.actorId.trim() : "";
  if (!actorId) return Response.json({ error: "an actor id is required" }, { status: 400 });
  const target = { applicationId: applicationId(), actorId };
  return dispatchAllocation(body.action, adminCall(), target, body);
}

async function dispatchAllocation(
  action: Action,
  call: EngineCall,
  target: AllocationTarget,
  body: AllocationBody,
): Promise<Response> {
  switch (action) {
    case "provision":
      return provision(call, target, body);
    case "fund":
      return fund(call, target, body);
    case "pause":
      return changeStatus(call, target, "paused");
    case "resume":
      return changeStatus(call, target, "active");
    case "revoke":
      return Response.json(await revokeAllocation(call, target));
    case "rotate":
      return Response.json(await rotateAllocationKey(call, { ...target, operationRef: randomUUID() }));
  }
}

async function provision(call: EngineCall, target: AllocationTarget, body: AllocationBody): Promise<Response> {
  const amount = usdAmount(body.amount);
  if (!amount) return Response.json({ error: "amount must be a USD decimal" }, { status: 400 });
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const grantId = typeof body.grantId === "string" ? body.grantId.trim() : "";
  if (!grantId) return Response.json({ error: "choose a grant" }, { status: 400 });
  return Response.json(await provisionActor(call, { ...target, amount, label, grantId }));
}

async function fund(call: EngineCall, target: AllocationTarget, body: AllocationBody): Promise<Response> {
  const amount = usdAmount(body.amount);
  if (!amount || isZero(amount)) {
    return Response.json({ error: "fund amount must be a USD decimal above zero" }, { status: 400 });
  }
  return Response.json(await fundAllocation(call, { ...target, amount, operationRef: randomUUID() }));
}

async function changeStatus(
  call: EngineCall,
  target: AllocationTarget,
  status: "active" | "paused",
): Promise<Response> {
  return Response.json(await setAllocationStatus(call, { ...target, status }));
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
