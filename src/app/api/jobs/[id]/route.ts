import { getJob, jobCost } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withSession(async (session) => {
    const call = actorCall(session.token);
    const [job, cost] = await Promise.all([getJob(call, id), jobCost(call, id)]);
    return Response.json({ job, cost });
  });
}
