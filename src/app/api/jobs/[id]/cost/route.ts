import { jobCost } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

type Context = { readonly params: Promise<{ readonly id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withSession(async (session) => {
    const cost = await jobCost(actorCall(session.token), id);
    return Response.json(cost);
  });
}
