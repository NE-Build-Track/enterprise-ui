import { randomUUID } from "node:crypto";

import { fundGrant } from "@/lib/engine/api";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { readBody, withOperator } from "@/lib/http";

const POSITIVE_USD = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withOperator(async () => {
    if (!isRecord(body) || typeof body.grantId !== "string" || body.grantId.trim() === "") {
      return Response.json({ error: "choose a grant" }, { status: 400 });
    }
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    if (!POSITIVE_USD.test(amount) || /^0+(?:\.0+)?$/.test(amount)) {
      return Response.json({ error: "amount must be a USD decimal above zero" }, { status: 400 });
    }
    await fundGrant(adminCall(), body.grantId.trim(), amount, randomUUID());
    return new Response(null, { status: 204 });
  });
}
