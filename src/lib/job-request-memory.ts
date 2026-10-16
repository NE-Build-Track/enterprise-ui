import type { JobRequest } from "./engine/types";
import { isRecord } from "./engine/errors";

const STORAGE_NAME = "lp-job-requests";
const RESULT_STORAGE = "lp-job-results";
const RESULT_LIMIT = 100_000;

export type StoredJobResult = { readonly contentType: string; readonly body: string; readonly truncated: boolean };

export function subscribeJobResults(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const notify = () => onChange();
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
}

export function rememberJobResult(jobId: string, result: StoredJobResult): void {
  const saved = readResults();
  saved[jobId] = {
    contentType: result.contentType,
    body: result.body.slice(0, RESULT_LIMIT),
    truncated: result.truncated || result.body.length > RESULT_LIMIT,
  };
  writeResults(saved);
}

let resultCache: { readonly jobId: string; readonly raw: string; readonly value: StoredJobResult | null } | null = null;

export function recallJobResultSnapshot(jobId: string): StoredJobResult | null {
  let raw = "";
  try {
    raw = sessionStorage.getItem(RESULT_STORAGE) ?? "";
  } catch {
    raw = "";
  }
  if (resultCache?.jobId === jobId && resultCache.raw === raw) return resultCache.value;
  const value = recallJobResult(jobId);
  resultCache = { jobId, raw, value };
  return value;
}

export function recallJobResult(jobId: string): StoredJobResult | null {
  const result = readResults()[jobId];
  if (!isRecord(result) || typeof result.body !== "string" || result.body === "") return null;
  return {
    contentType: typeof result.contentType === "string" ? result.contentType : "",
    body: result.body,
    truncated: result.truncated === true,
  };
}

export function rememberJobRequest(jobId: string, request: JobRequest): void {
  const saved = readAll();
  saved[jobId] = request;
  writeAll(saved);
}

export function recallJobRequest(jobId: string): JobRequest | null {
  const request = readAll()[jobId];
  if (!isRecord(request) || typeof request.app !== "string") return null;
  return request as JobRequest;
}

function readAll(): Record<string, JobRequest> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_NAME) ?? "{}");
    return isRecord(parsed) ? (parsed as Record<string, JobRequest>) : {};
  } catch {
    return {};
  }
}

function writeAll(value: Record<string, JobRequest>): void {
  try {
    sessionStorage.setItem(STORAGE_NAME, JSON.stringify(value));
  } catch {
    // Private browsing can reject storage. Run again then opens a new job for the task.
  }
}

function readResults(): Record<string, StoredJobResult> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(RESULT_STORAGE) ?? "{}");
    return isRecord(parsed) ? (parsed as Record<string, StoredJobResult>) : {};
  } catch {
    return {};
  }
}

function writeResults(value: Record<string, StoredJobResult>): void {
  try {
    sessionStorage.setItem(RESULT_STORAGE, JSON.stringify(value));
  } catch {
    // The detail page then says this browser did not keep the result.
  }
}
