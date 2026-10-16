import { jobResult } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withSession(async (session) => {
    const result = await jobResult(actorCall(session.token), id);
    const type = result.contentType.split(";")[0]?.trim().toLowerCase() ?? "application/octet-stream";
    return new Response(result.body, {
      status: result.status,
      headers: {
        "content-type": type || "application/octet-stream",
        "content-disposition": "attachment",
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store",
      },
    });
  });
}
