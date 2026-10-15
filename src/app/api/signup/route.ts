import { applicationId, signupInviteCode } from "@/lib/config";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { engineFailure, readBody } from "@/lib/http";
import { issueActorKey } from "@/lib/issue-actor-key";

export async function POST(request: Request): Promise<Response> {
  const invite = signupInviteCode();
  if (!invite) {
    return Response.json({ error: "signup is disabled" }, { status: 403 });
  }
  try {
    const body = await readBody(request);
    if (!isRecord(body) || body.inviteCode !== invite) {
      return Response.json({ error: "the invite code is wrong" }, { status: 403 });
    }
    const actorId = typeof body.actorId === "string" ? body.actorId : "";
    const label = typeof body.label === "string" ? body.label : "";
    const issued = await issueActorKey(adminCall(), {
      actorId,
      applicationId: applicationId(),
      label,
    });
    return Response.json(
      { token: issued.token, key: issued.key },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return engineFailure(error);
  }
}
