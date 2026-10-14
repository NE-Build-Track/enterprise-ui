import { getJob, jobCost } from "@/lib/engine/api";
import { adminCall } from "@/lib/engine/server";
import { withOperator } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withOperator(async () => {
    const call = adminCall();
    const [job, cost] = await Promise.all([getJob(call, id), jobCost(call, id)]);
    return Response.json({ job, cost });
  });
}
