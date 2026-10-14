import { reportUsage } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { isRecord } from "@/lib/engine/errors";
import { readBody, withSession } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const body = await readBody(request);
  const quantities = isRecord(body) ? body.quantities : null;
  if (!isQuantities(quantities)) {
    return Response.json({ error: "quantities must be whole numbers" }, { status: 400 });
  }
  return withSession(async (session) => {
    const job = await reportUsage(actorCall(session.token), id, quantities);
    return Response.json(job);
  });
}

function isQuantities(value: unknown): value is Record<string, number> {
  if (!isRecord(value) || Object.keys(value).length === 0) return false;
  return Object.values(value).every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0);
}
