import { jobResult } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";
import { storedDownload } from "@/lib/stored-download";

type Context = { readonly params: Promise<{ readonly id: string }> };

export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withSession(async (session) => {
    const result = await jobResult(actorCall(session.token), id);
    return storedDownload(id, result.bytes, result.contentType, result.status);
  });
}
