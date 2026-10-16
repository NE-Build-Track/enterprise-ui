import { createGrant, listGrants } from "@/lib/engine/api";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { readBody, withOperator } from "@/lib/http";

export async function GET(): Promise<Response> {
  return withOperator(async () => {
    return Response.json(await listGrants(adminCall()));
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withOperator(async () => {
    if (!isRecord(body) || typeof body.name !== "string" || body.name.trim() === "") {
      return Response.json({ error: "a grant name is required" }, { status: 400 });
    }
    const amount = typeof body.amount === "string" ? body.amount.trim() : "";
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount) || /^0+(?:\.0+)?$/.test(amount)) {
      return Response.json({ error: "amount must be a USD decimal above zero" }, { status: 400 });
    }
    return Response.json(await createGrant(adminCall(), body.name.trim(), amount), { status: 201 });
  });
}
