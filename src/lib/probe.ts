import type { Job } from "./engine/types";

export type ProbeVerdict = "accepted" | "payment_refused" | "other";

export type ProbeRow = {
  readonly app: string;
  readonly orchestratorUrl: string | null;
  readonly outcome: string | null;
  readonly statusCode: number | null;
  readonly failureKind: string | null;
  readonly verdict: ProbeVerdict;
};

export function verdictForJob(job: Job | null, httpStatus: number): ProbeVerdict {
  if (job?.state === "succeeded") return "accepted";
  const refused = job?.attempts.some((attempt) => attempt.outcome === "payment_refused") ?? false;
  if (refused) return "payment_refused";
  if (job?.failure?.kind === "payment" && (job.failure.status_code === 400 || httpStatus === 400)) {
    return "payment_refused";
  }
  if (httpStatus === 400 && job?.failure?.message.toLowerCase().includes("recipient")) return "payment_refused";
  return "other";
}

export function probeRow(app: string, job: Job | null, httpStatus: number): ProbeRow {
  const attempt = job?.attempts.at(-1) ?? null;
  return {
    app,
    orchestratorUrl: attempt?.orchestrator_url ?? null,
    outcome: attempt?.outcome ?? null,
    statusCode: attempt?.status_code ?? job?.failure?.status_code ?? httpStatus,
    failureKind: job?.failure?.kind ?? null,
    verdict: verdictForJob(job, httpStatus),
  };
}
