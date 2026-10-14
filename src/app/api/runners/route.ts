import { runners } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { withSession } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  const app = new URL(request.url).searchParams.get("app") ?? "";
  if (!app) return Response.json({ error: "app is required" }, { status: 400 });
  return withSession(async (session) => Response.json(await runners(actorCall(session.token), app)));
}
