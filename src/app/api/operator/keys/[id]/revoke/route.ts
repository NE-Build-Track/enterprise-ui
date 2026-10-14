import { revokeKey } from "@/lib/engine/api";
import { adminCall } from "@/lib/engine/server";
import { withOperator } from "@/lib/http";

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  return withOperator(async () => {
    await revokeKey(adminCall(), id);
    return new Response(null, { status: 204 });
  });
}
