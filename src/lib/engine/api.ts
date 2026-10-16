import { engineErrorFrom, EngineRequestError, isRecord } from "./errors";
import { engineFetch, type EngineCall } from "./client";
import type {
  AccessKey,
  Allowance,
  CostSummary,
  EngineHealth,
  IssuedKey,
  IssueKeyBody,
  Job,
  JobCost,
  JobRequest,
  Offering,
  ProvisionedActor,
  Reconciliation,
  Runner,
  SyncReport,
} from "./types";

type Fetched<T> = {
  readonly data?: T;
  readonly error?: unknown;
  readonly response: Response;
};

const NIL_JOB_ID = "00000000-0000-0000-0000-000000000000";

export type RawEngineBody = {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
  readonly jobId: string | null;
};

export type ReservedProbe = {
  readonly route: string;
  readonly status: number;
  readonly milestone: string | null;
  readonly ticket: string | null;
  readonly error: string | null;
};

async function unwrap<T>(result: Fetched<T>): Promise<T> {
  if (result.response.ok) return result.data as T;
  throw engineErrorFrom(result.response.status, result.error, result.response.headers);
}

export async function readyz(call: EngineCall): Promise<{ status: number; health: EngineHealth }> {
  const result = await call.client.GET("/readyz");
  const body = (result.response.ok ? result.data : result.error) as EngineHealth | undefined;
  if (!body || typeof body !== "object" || !("ready" in body)) {
    throw engineErrorFrom(result.response.status, result.error, result.response.headers);
  }
  return { status: result.response.status, health: body };
}

export async function livez(call: EngineCall): Promise<{ status: string }> {
  const response = await engineFetch(call, "/livez");
  const text = await response.text();
  if (!response.ok) throw engineErrorFrom(response.status, text, response.headers);
  return { status: "ok" };
}

export async function offerings(call: EngineCall, app?: string): Promise<Offering[]> {
  const result = await call.client.GET("/v1/offerings", {
    params: { query: app ? { app } : {} },
  });
  return unwrap(result);
}

export async function runners(call: EngineCall, app: string): Promise<Runner[]> {
  const result = await call.client.GET("/v1/runners", { params: { query: { app } } });
  return unwrap(result);
}

export async function listJobs(call: EngineCall, limit = 50): Promise<Job[]> {
  const result = await call.client.GET("/v1/jobs", { params: { query: { limit } } });
  return unwrap(result);
}

export async function runJob(call: EngineCall, body: JobRequest): Promise<RawEngineBody> {
  const response = await engineFetch(call, "/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const jobId = response.headers.get("livepeer-job-id");
  if (!response.ok) {
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : text;
    } catch {
      parsed = text;
    }
    throw engineErrorFrom(response.status, parsed, response.headers);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    body: text,
    jobId,
  };
}

export async function getJob(call: EngineCall, jobId: string): Promise<Job> {
  const result = await call.client.GET("/v1/jobs/{job_id}", { params: { path: { job_id: jobId } } });
  return unwrap(result);
}

export async function jobCost(call: EngineCall, jobId: string): Promise<JobCost> {
  const result = await call.client.GET("/v1/jobs/{job_id}/cost", {
    params: { path: { job_id: jobId } },
  });
  return unwrap(result);
}

export type StoredEngineBody = {
  readonly status: number;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly jobId: string | null;
};

export async function jobResult(call: EngineCall, jobId: string): Promise<StoredEngineBody> {
  const response = await engineFetch(call, `/v1/jobs/${jobId}/result`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.ok) {
    const text = new TextDecoder().decode(bytes);
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : text;
    } catch {
      parsed = text;
    }
    throw engineErrorFrom(response.status, parsed, response.headers);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    bytes,
    jobId: response.headers.get("livepeer-job-id"),
  };
}

export async function reportUsage(
  call: EngineCall,
  jobId: string,
  quantities: Record<string, number>,
): Promise<Job> {
  const result = await call.client.POST("/v1/jobs/{job_id}/usage", {
    params: { path: { job_id: jobId } },
    body: { quantities },
  });
  return unwrap(result);
}

export async function costSummary(
  call: EngineCall,
  query: { start?: string; end?: string; actorId?: string },
): Promise<CostSummary> {
  const result = await call.client.GET("/v1/costs/summary", {
    params: {
      query: {
        ...(query.start ? { start: query.start } : {}),
        ...(query.end ? { end: query.end } : {}),
        ...(query.actorId ? { actor_id: query.actorId } : {}),
      },
    },
  });
  return unwrap(result);
}

export async function allowance(call: EngineCall, actorId?: string): Promise<Allowance> {
  const result = await call.client.GET("/v1/allowance", {
    params: { query: actorId ? { actor_id: actorId } : {} },
  });
  return unwrap(result);
}

export async function listKeys(call: EngineCall, applicationId?: string): Promise<AccessKey[]> {
  const result = await call.client.GET("/v1/admin/keys", {
    params: { query: applicationId ? { application_id: applicationId } : {} },
  });
  return unwrap(result);
}

export async function issueKey(call: EngineCall, body: IssueKeyBody): Promise<IssuedKey> {
  const result = await call.client.POST("/v1/admin/keys", { body });
  return unwrap(result);
}

export async function revokeKey(call: EngineCall, keyId: string): Promise<void> {
  const result = await call.client.POST("/v1/admin/keys/{key_id}/revoke", {
    params: { path: { key_id: keyId } },
  });
  await unwrap(result);
}

export type AllocationTarget = {
  readonly applicationId: string;
  readonly actorId: string;
};

function allocationParams(target: AllocationTarget) {
  return { path: { application_id: target.applicationId, actor_id: target.actorId } };
}

export async function provisionActor(
  call: EngineCall,
  target: AllocationTarget & { readonly amount: string; readonly label: string; readonly grantId?: string },
): Promise<ProvisionedActor> {
  const result = await call.client.POST(
    "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation",
    {
      params: allocationParams(target),
      body: {
        amount: { amount: target.amount, currency: "USD" },
        label: target.label,
        grant_id: target.grantId ?? "",
      },
    },
  );
  return unwrap(result);
}

export type EngineGrant = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly currency: string;
  readonly total: string;
};

export async function listGrants(call: EngineCall): Promise<EngineGrant[]> {
  const result = await call.client.GET("/v1/admin/grants");
  if (!result.response.ok) throw engineErrorFrom(result.response.status, result.error, result.response.headers);
  if (!Array.isArray(result.data)) throw new Error("the engine did not return a grant list");
  return result.data.flatMap((item) => {
    const grant = asGrant(item);
    return grant ? [grant] : [];
  });
}

export async function createGrant(call: EngineCall, name: string, amount: string): Promise<EngineGrant> {
  const result = await call.client.POST("/v1/admin/grants", {
    body: { name, amount: { amount, currency: "USD" } },
  });
  if (!result.response.ok) throw engineErrorFrom(result.response.status, result.error, result.response.headers);
  const grant = asGrant(result.data);
  if (!grant) throw new Error("the engine did not return a grant");
  return grant;
}

export async function fundGrant(call: EngineCall, amount: string, operationRef: string): Promise<void> {
  const result = await call.client.POST("/v1/admin/grant/fund", {
    body: { amount: { amount, currency: "USD" }, operation_ref: operationRef },
  });
  await unwrap(result);
}

function asGrant(value: unknown): EngineGrant | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    typeof value.status !== "string" ||
    typeof value.currency !== "string" ||
    typeof value.total !== "string"
  ) {
    return null;
  }
  return {
    id: value.id,
    name: value.name,
    status: value.status,
    currency: value.currency,
    total: value.total,
  };
}

export async function fundAllocation(
  call: EngineCall,
  target: AllocationTarget & { readonly amount: string; readonly operationRef: string },
): Promise<ProvisionedActor> {
  const result = await call.client.POST(
    "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation/fund",
    {
      params: allocationParams(target),
      body: {
        amount: { amount: target.amount, currency: "USD" },
        operation_ref: target.operationRef,
      },
    },
  );
  return unwrap(result);
}

export async function setAllocationStatus(
  call: EngineCall,
  target: AllocationTarget & { readonly status: "active" | "paused" },
): Promise<ProvisionedActor> {
  const result = await call.client.POST(
    "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation/status",
    {
      params: allocationParams(target),
      body: { status: target.status },
    },
  );
  return unwrap(result);
}

export async function revokeAllocation(call: EngineCall, target: AllocationTarget): Promise<ProvisionedActor> {
  const result = await call.client.POST(
    "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation/revoke",
    { params: allocationParams(target) },
  );
  return unwrap(result);
}

export async function rotateAllocationKey(
  call: EngineCall,
  target: AllocationTarget & { readonly operationRef: string },
): Promise<ProvisionedActor> {
  const result = await call.client.POST(
    "/v1/admin/applications/{application_id}/actors/{actor_id}/allocation/rotate-key",
    {
      params: allocationParams(target),
      body: { operation_ref: target.operationRef },
    },
  );
  return unwrap(result);
}

export async function reconcile(
  call: EngineCall,
  query: { applicationId?: string; actorId?: string },
): Promise<Reconciliation> {
  const result = await call.client.GET("/v1/admin/reconciliation", {
    params: {
      query: {
        ...(query.applicationId ? { application_id: query.applicationId } : {}),
        ...(query.actorId ? { actor_id: query.actorId } : {}),
      },
    },
  });
  return unwrap(result);
}

export async function syncCosts(call: EngineCall): Promise<SyncReport> {
  const result = await call.client.POST("/v1/admin/costs/sync");
  return unwrap(result);
}

export async function events(call: EngineCall): Promise<unknown> {
  const result = await call.client.GET("/v1/events", { params: { query: { after: 0, limit: 1 } } });
  return unwrap(result);
}

export async function openSession(call: EngineCall): Promise<unknown> {
  const result = await call.client.POST("/v1/sessions", {
    body: { app: "reserved-probe", idle_timeout_s: 300, max_duration_s: 3600 },
  });
  return unwrap(result);
}

export async function reservedProbes(call: EngineCall): Promise<ReservedProbe[]> {
  return [
    await capture("GET /v1/events", events(call)),
    await capture("POST /v1/sessions", openSession(call)),
    await capture(`GET /v1/jobs/${NIL_JOB_ID}/result`, jobResult(call, NIL_JOB_ID)),
  ];
}

async function capture(route: string, work: Promise<unknown>): Promise<ReservedProbe> {
  try {
    await work;
    return { route, status: 200, milestone: null, ticket: null, error: null };
  } catch (error) {
    if (error instanceof EngineRequestError) {
      return {
        route,
        status: error.status,
        milestone: error.milestone,
        ticket: error.ticket,
        error: error.message,
      };
    }
    throw error;
  }
}

/**
 * Every engine route this app calls.
 * `src/lib/engine/coverage.test.ts` fails when openapi.json grows a route that is missing here.
 */
export const engineHandlers = {
  "GET /readyz": readyz,
  "GET /livez": livez,
  "GET /v1/offerings": offerings,
  "GET /v1/runners": runners,
  "GET /v1/jobs": listJobs,
  "POST /v1/jobs": runJob,
  "GET /v1/jobs/{job_id}": getJob,
  "GET /v1/jobs/{job_id}/cost": jobCost,
  "GET /v1/jobs/{job_id}/result": jobResult,
  "POST /v1/jobs/{job_id}/usage": reportUsage,
  "GET /v1/costs/summary": costSummary,
  "GET /v1/allowance": allowance,
  "GET /v1/admin/keys": listKeys,
  "POST /v1/admin/keys": issueKey,
  "POST /v1/admin/keys/{key_id}/revoke": revokeKey,
  "GET /v1/admin/grants": listGrants,
  "POST /v1/admin/grants": createGrant,
  "POST /v1/admin/grant/fund": fundGrant,
  "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation": provisionActor,
  "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/fund": fundAllocation,
  "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/status": setAllocationStatus,
  "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/revoke": revokeAllocation,
  "POST /v1/admin/applications/{application_id}/actors/{actor_id}/allocation/rotate-key": rotateAllocationKey,
  "GET /v1/admin/reconciliation": reconcile,
  "POST /v1/admin/costs/sync": syncCosts,
  "GET /v1/events": events,
  "POST /v1/sessions": openSession,
} as const;
