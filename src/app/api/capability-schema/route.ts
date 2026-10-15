import { loadCapabilityForm } from "@/lib/capability-schema-server";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  const app = new URL(request.url).searchParams.get("app")?.trim() ?? "";
  if (!app) return Response.json({ error: "app is required" }, { status: 400 });
  return withSession(async (session) => {
    const result = await loadCapabilityForm(actorCall(session.token), app);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({
      app: result.app,
      required: result.required,
      schema: result.schema,
      example: result.example,
    });
  });
}
