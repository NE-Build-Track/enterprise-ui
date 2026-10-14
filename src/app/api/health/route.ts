import { livez, readyz } from "@/lib/engine/api";
import { EngineRequestError } from "@/lib/engine/errors";
import { publicCall } from "@/lib/engine/server";

export async function GET(): Promise<Response> {
  const call = publicCall();
  const [live, ready] = await Promise.all([
    livez(call).then(
      (body) => ({ ok: true as const, body }),
      (error: unknown) => ({
        ok: false as const,
        error: error instanceof Error ? error.message : "live check failed",
      }),
    ),
    readyz(call).then(
      (body) => body,
      (error: unknown) => {
        if (error instanceof EngineRequestError) {
          return { status: error.status, health: null, error: error.message };
        }
        return { status: 503, health: null, error: error instanceof Error ? error.message : "ready check failed" };
      },
    ),
  ]);
  return Response.json({ live, ready });
}
