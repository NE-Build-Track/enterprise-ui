"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { isAllowance, isCostSummary, isJob, isJobCost, isOffering, isReconciliation, listOf } from "@/gyral/guards";
import { api, type ApiResult } from "@/lib/client-api";
import type { Allowance, CostSummary, Job, JobCost, Offering, Reconciliation } from "@/lib/engine/types";
import { nextJobCost } from "@/lib/job-costs";
import { JOB_LIST_LIMIT } from "@/lib/job-history";
import { defaultCostWindow } from "@/lib/money";

const isJobs = listOf(isJob);
const isOfferings = listOf(isOffering);

function unchanged<T>(current: T, next: T): T {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

function applyChecked<T extends S, S>(
  result: ApiResult,
  accept: (body: unknown) => body is T,
  invalidMessage: string,
  setValue: Dispatch<SetStateAction<S>>,
  setError: Dispatch<SetStateAction<string>>,
): void {
  if (result.ok && accept(result.body)) {
    const next = result.body;
    setValue((current) => unchanged(current, next));
    setError("");
    return;
  }
  setError(result.ok ? invalidMessage : result.error);
}

export function useConsoleData() {
  const initialWindow = defaultCostWindow();
  const [start, setStart] = useState(initialWindow.start);
  const [end, setEnd] = useState(initialWindow.end);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [allowanceError, setAllowanceError] = useState("");
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const [jobsError, setJobsError] = useState("");
  const [offerings, setOfferings] = useState<readonly Offering[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const summaryGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api(`/api/jobs?limit=${JOB_LIST_LIMIT}`),
      api("/api/allowance"),
      api("/api/offerings"),
      api("/api/reconciliation"),
    ]).then(([jobsResult, allowanceResult, offeringsResult, reconciliationResult]) => {
      if (!active) return;
      applyChecked(jobsResult, isJobs, "Jobs could not be loaded.", setJobs, setJobsError);
      applyChecked(allowanceResult, isAllowance, "Allowance could not be loaded.", setAllowance, setAllowanceError);
      if (offeringsResult.ok && isOfferings(offeringsResult.body)) {
        const nextOfferings = offeringsResult.body;
        setOfferings((current) => unchanged(current, nextOfferings));
      }
      applyChecked(
        reconciliationResult,
        isReconciliation,
        "Reconciliation could not be loaded.",
        setReconciliation,
        setReconciliationError,
      );
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const request = summaryGeneration.current + 1;
    summaryGeneration.current = request;
    void api(`/api/costs/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`).then((summaryResult) => {
      if (summaryGeneration.current !== request) return;
      if (summaryResult.ok && isCostSummary(summaryResult.body)) {
        const summary = summaryResult.body;
        setSummary((current) => unchanged<CostSummary | null>(current, summary));
        setSummaryError("");
        return;
      }
      setSummaryError(summaryResult.ok ? "Cost summary could not be loaded." : summaryResult.error);
      setSummary(null);
    });
  }, [end, start]);

  return {
    start,
    end,
    setStart,
    setEnd,
    allowance,
    allowanceError,
    summary,
    summaryError,
    jobs,
    jobsError,
    offerings,
    reconciliation,
    reconciliationError,
    loaded,
  };
}

/** One cost read for the ids on screen. A new id set, such as another page or period, reads again. */
export function useJobCosts(ids: readonly string[]): {
  readonly costs: ReadonlyMap<string, JobCost | null>;
  readonly costsError: string;
} {
  const idKey = ids.join("\n");
  const [costs, setCosts] = useState<ReadonlyMap<string, JobCost | null>>(new Map());
  const [costsError, setCostsError] = useState("");

  useEffect(() => {
    const jobIds = idKey ? idKey.split("\n") : [];
    if (jobIds.length === 0) return;
    const allowed = new Set(jobIds);
    let cancelled = false;
    void Promise.all(jobIds.map(fetchJobCost)).then((rows) => {
      if (cancelled) return;
      const failed = rows.some(([, cost]) => cost === null);
      setCostsError(failed ? "Cost detail could not be loaded for every job." : "");
      setCosts((current) => mergeJobCosts(current, rows, allowed));
    });
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const allowed = new Set(idKey ? idKey.split("\n") : []);
  return { costs: retainCosts(costs, allowed), costsError };
}

export function mergeJobCosts(
  current: ReadonlyMap<string, JobCost | null>,
  rows: readonly (readonly [string, JobCost | null])[],
  allowed: ReadonlySet<string>,
): ReadonlyMap<string, JobCost | null> {
  const next = new Map<string, JobCost | null>();
  for (const [id, cost] of current) {
    if (allowed.has(id)) next.set(id, cost);
  }
  for (const [id, cost] of rows) {
    if (!allowed.has(id)) continue;
    next.set(id, nextJobCost(next.get(id), cost));
  }
  return next;
}

function retainCosts(
  current: ReadonlyMap<string, JobCost | null>,
  allowed: ReadonlySet<string>,
): ReadonlyMap<string, JobCost | null> {
  for (const id of current.keys()) {
    if (!allowed.has(id)) {
      const next = new Map<string, JobCost | null>();
      for (const [kept, cost] of current) {
        if (allowed.has(kept)) next.set(kept, cost);
      }
      return next;
    }
  }
  return current;
}

async function fetchJobCost(id: string): Promise<readonly [string, JobCost | null]> {
  const result = await api(`/api/jobs/${encodeURIComponent(id)}/cost`);
  return [id, result.ok && isJobCost(result.body) ? result.body : null];
}
