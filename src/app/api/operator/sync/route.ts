import { syncCosts } from "@/lib/engine/api";
import { adminCall } from "@/lib/engine/server";
import { withOperator } from "@/lib/http";

export async function POST(): Promise<Response> {
  return withOperator(async () => Response.json(await syncCosts(adminCall())));
}
