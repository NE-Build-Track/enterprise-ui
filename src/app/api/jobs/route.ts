import { getJob, jobCost, listJobs, runJob } from "@/lib/engine/api";
import { actorCall } from "@/lib/engine/server";
import { isRecord } from "@/lib/engine/errors";
import type { JobRequest } from "@/lib/engine/types";
import { engineFailure, readBody, withSession } from "@/lib/http";

export async function GET(request: Request): Promise<Response> {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? "50");
  return withSession(async (session) => {
    const jobs = await listJobs(actorCall(session.token), Number.isInteger(limit) ? limit : 50);
    return Response.json(jobs);
  });
}

export async function POST(request: Request): Promise<Response> {
  return withSession(async (session) => {
    const body = await readBody(request);
    if (!isJobRequest(body)) return Response.json({ error: "app is required" }, { status: 400 });
    const call = actorCall(session.token);
    try {
      const run = await runJob(call, body);
      const job = run.jobId ? await getJob(call, run.jobId) : null;
      const cost = run.jobId ? await jobCost(call, run.jobId).catch(() => null) : null;
      return Response.json({
        ok: true,
        status: run.status,
        contentType: run.contentType,
        body: run.body,
        jobId: run.jobId,
        job,
        cost,
      });
    } catch (error) {
      return engineFailure(error);
    }
  });
}

function isJobRequest(value: unknown): value is JobRequest {
  return isRecord(value) && typeof value.app === "string" && value.app.trim() !== "";
}
