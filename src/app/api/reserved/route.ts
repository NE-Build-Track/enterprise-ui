import { reservedProbes } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(): Promise<Response> {
  return withSession(async (session) => Response.json(await reservedProbes(actorCall(session.token))));
}
