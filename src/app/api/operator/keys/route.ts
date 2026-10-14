import { applicationId } from "@/lib/config";
import { issueKey, listKeys } from "@/lib/engine/api";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { readBody, withOperator } from "@/lib/http";
import { issueActorKey } from "@/lib/issue-actor-key";

export async function GET(): Promise<Response> {
  return withOperator(async () => Response.json(await listKeys(adminCall(), applicationId())));
}

export async function POST(request: Request): Promise<Response> {
  const body = await readBody(request);
  return withOperator(async () => {
    if (!isRecord(body) || typeof body.actorId !== "string") {
      return Response.json({ error: "an actor id is required" }, { status: 400 });
    }
    if (body.kind === "admin") {
      const issued = await issueKey(adminCall(), {
        kind: "admin",
        actor_id: body.actorId.trim() || "operator",
        application_id: applicationId(),
        label: typeof body.label === "string" ? body.label : "operator",
        permissions: null,
      });
      return Response.json({ token: issued.token, key: issued.key }, { status: 201 });
    }
    const issued = await issueActorKey(adminCall(), {
      actorId: body.actorId,
      applicationId: applicationId(),
      label: typeof body.label === "string" ? body.label : "",
    });
    return Response.json({ token: issued.token, key: issued.key }, { status: 201 });
  });
}
