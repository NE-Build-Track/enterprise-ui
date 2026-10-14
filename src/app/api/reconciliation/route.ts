import { applicationId } from "@/lib/config";
import { reconcile } from "@/lib/engine/api";
import { adminCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(): Promise<Response> {
  return withSession(async (session) => {
    if (!session.actorId) {
      return Response.json(
        { error: "this key was not issued here, so its actor id is unknown" },
        { status: 409 },
      );
    }
    const row = await reconcile(adminCall(), {
      applicationId: session.applicationId || applicationId(),
      actorId: session.actorId,
    });
    return Response.json(row);
  });
}
