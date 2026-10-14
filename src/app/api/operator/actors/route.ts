import { adminCall } from "@/lib/engine/server";
import { withOperator } from "@/lib/http";
import { defaultCostWindow } from "@/lib/money";
import { actorSnapshots } from "@/lib/snapshots";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const window = defaultCostWindow();
  return withOperator(async () =>
    Response.json(
      await actorSnapshots(adminCall(), {
        start: params.get("start") ?? window.start,
        end: params.get("end") ?? window.end,
      }),
    ),
  );
}
