import type { Job } from "./types";

export type EngineErrorDetails = {
  readonly job: Job | null;
  readonly retryAfter: string | null;
  readonly jobId: string | null;
  readonly milestone: string | null;
  readonly ticket: string | null;
};

export class EngineRequestError extends Error {
  readonly status: number;
  readonly job: Job | null;
  readonly retryAfter: string | null;
  readonly jobId: string | null;
  readonly milestone: string | null;
  readonly ticket: string | null;

  constructor(status: number, message: string, details: EngineErrorDetails) {
    super(message);
    this.name = "EngineRequestError";
    this.status = status;
    this.job = details.job;
    this.retryAfter = details.retryAfter;
    this.jobId = details.jobId;
    this.milestone = details.milestone;
    this.ticket = details.ticket;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJob(value: unknown): value is Job {
  return isRecord(value) && typeof value.id === "string" && typeof value.state === "string";
}

export function engineErrorFrom(status: number, body: unknown, headers: Headers): EngineRequestError {
  const parsed = readErrorBody(body);
  return new EngineRequestError(status, parsed.error, {
    job: parsed.job,
    retryAfter: headers.get("retry-after"),
    jobId: headers.get("livepeer-job-id"),
    milestone: parsed.milestone,
    ticket: parsed.ticket,
  });
}

function readErrorBody(body: unknown): {
  error: string;
  job: Job | null;
  milestone: string | null;
  ticket: string | null;
} {
  if (typeof body === "string" && body.trim() !== "") {
    return { error: body, job: null, milestone: null, ticket: null };
  }
  if (!isRecord(body)) {
    return { error: "the engine returned an error", job: null, milestone: null, ticket: null };
  }
  const detail = validationMessage(body.detail);
  const error =
    typeof body.error === "string"
      ? body.error
      : detail ?? "the engine returned an error";
  return {
    error,
    job: isJob(body.job) ? body.job : null,
    milestone: typeof body.milestone === "string" ? body.milestone : null,
    ticket: typeof body.ticket === "string" ? body.ticket : null,
  };
}

function validationMessage(detail: unknown): string | null {
  if (!Array.isArray(detail)) return null;
  const messages = detail.flatMap((item) => {
    if (!isRecord(item) || typeof item.msg !== "string") return [];
    const loc = Array.isArray(item.loc) ? item.loc.map(String).join(".") : "";
    return [loc ? `${loc}: ${item.msg}` : item.msg];
  });
  return messages.length > 0 ? messages.join("; ") : null;
}
