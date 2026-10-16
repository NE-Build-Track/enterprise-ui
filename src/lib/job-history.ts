import type { CostClass, Job, JobCost } from "./engine/types";

import { offeringCopy } from "./job-copy";

export const JOB_PAGE_SIZE = 25;
export const JOB_LIST_LIMIT = 500;
export const BILLING_COST_LIMIT = 25;

const STATES = new Set<Job["state"]>(["queued", "running", "succeeded", "failed", "uncertain"]);

export type JobFilters = {
  readonly q: string;
  readonly state: Job["state"] | "";
  readonly app: string;
  readonly from: string;
  readonly to: string;
  readonly page: number;
  readonly ids: readonly string[];
};

export function readJobFilters(params: URLSearchParams): JobFilters {
  const state = params.get("state") ?? "";
  const page = Number(params.get("page") ?? "1");
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return {
    q: params.get("q") ?? "",
    state: STATES.has(state as Job["state"]) ? (state as Job["state"]) : "",
    app: params.get("app") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    ids,
  };
}

export function filterJobs(jobs: readonly Job[], filters: JobFilters): Job[] {
  const query = filters.q.trim().toLowerCase();
  const from = dayBound(filters.from, "start");
  const to = dayBound(filters.to, "end");
  const ids = new Set(filters.ids);
  return [...jobs]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .filter((job) => {
      if (ids.size > 0 && !ids.has(job.id)) return false;
      if (filters.state && job.state !== filters.state) return false;
      if (filters.app && job.app !== filters.app) return false;
      const created = Date.parse(job.created_at);
      if (from !== null && (Number.isNaN(created) || created < from)) return false;
      if (to !== null && (Number.isNaN(created) || created > to)) return false;
      if (!query) return true;
      const haystack = [job.id, job.operation_ref ?? "", job.app, offeringCopy(job.app).name].join(" ").toLowerCase();
      return haystack.includes(query);
    });
}

export function paginate<T>(items: readonly T[], page: number, size = JOB_PAGE_SIZE): { readonly page: number; readonly pages: number; readonly items: readonly T[] } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(page, 1), pages);
  const start = (current - 1) * size;
  return { page: current, pages, items: items.slice(start, start + size) };
}

export function inWindow(job: Job, start: string, end: string): boolean {
  const created = Date.parse(job.created_at);
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (Number.isNaN(created) || Number.isNaN(from) || Number.isNaN(to)) return false;
  return created >= from && created <= to;
}

export function billingCostJobs<T>(jobs: readonly T[]): { readonly jobs: readonly T[]; readonly truncated: boolean } {
  return {
    jobs: jobs.slice(0, BILLING_COST_LIMIT),
    truncated: jobs.length > BILLING_COST_LIMIT,
  };
}

export function jobsForClass(jobs: readonly Job[], costs: ReadonlyMap<string, JobCost | null>, name: CostClass): Job[] {
  return jobs.filter((job) => costs.get(job.id)?.attempts.some((attempt) => attempt.cost_class === name));
}

function dayBound(value: string, edge: "start" | "end"): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const date = edge === "start" ? new Date(year, month - 1, day, 0, 0, 0, 0) : new Date(year, month - 1, day, 23, 59, 59, 999);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}
