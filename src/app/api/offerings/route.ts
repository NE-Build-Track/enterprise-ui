import { offerings } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  const app = new URL(request.url).searchParams.get("app") ?? undefined;
  return withSession(async (session) => {
    const rows = await offerings(actorCall(session.token), app ?? undefined);
    return Response.json(rows);
  });
}
