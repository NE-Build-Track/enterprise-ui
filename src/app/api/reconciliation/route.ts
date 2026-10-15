import { applicationId, engineUrl } from "@/lib/config";
import { reconcile } from "@/lib/engine/api";
import { createEngineCall } from "@/lib/engine/client";
import { adminCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";
import { resolveActor } from "@/lib/resolve-actor";
import { writeSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  return withSession(async (session) => {
    const actor = await resolveActor(createEngineCall(engineUrl(), session.token), adminCall(), session.token, {
      actorId: session.actorId,
      applicationId: session.applicationId || applicationId(),
    });
    if (!actor) {
      return Response.json(
        { error: "this key was not issued here, so its actor id is unknown" },
        { status: 409 },
      );
    }
    if (session.actorId !== actor.actorId || session.applicationId !== actor.applicationId) {
      await writeSession({ ...session, actorId: actor.actorId, applicationId: actor.applicationId });
    }
    const row = await reconcile(adminCall(), {
      applicationId: actor.applicationId,
      actorId: actor.actorId,
    });
    return Response.json(row);
  });
}
