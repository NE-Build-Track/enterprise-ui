import { costSummary } from "@/lib/engine/api";
import { actorCall, adminCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";
import { defaultCostWindow } from "@/lib/money";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const window = defaultCostWindow();
  const start = params.get("start") ?? window.start;
  const end = params.get("end") ?? window.end;
  const actorId = params.get("actorId");
  return withSession(async (session) => {
    if (actorId) {
      if (session.role !== "operator") {
        return Response.json({ error: "an admin credential is required" }, { status: 403 });
      }
      return Response.json(await costSummary(adminCall(), { start, end, actorId }));
    }
    return Response.json(await costSummary(actorCall(session.token), { start, end }));
  });
}
