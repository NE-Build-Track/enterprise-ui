import { allowance } from "@/lib/engine/api";
import { actorCall, adminCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  const actorId = new URL(request.url).searchParams.get("actorId");
  return withSession(async (session) => {
    if (actorId) {
      if (session.role !== "operator") {
        return Response.json({ error: "an admin credential is required" }, { status: 403 });
      }
      return Response.json(await allowance(adminCall(), actorId));
    }
    return Response.json(await allowance(actorCall(session.token)));
  });
}
