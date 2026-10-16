"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isAllowance, isCostSummary, isJob, isJobCost, isOffering, isReconciliation, listOf } from "@/gyral/guards";
import { api } from "@/lib/client-api";
import type { Allowance, CostSummary, Job, JobCost, Offering, Reconciliation } from "@/lib/engine/types";
import { JOB_LIST_LIMIT } from "@/lib/job-history";
import { defaultCostWindow } from "@/lib/money";

const isJobs = listOf(isJob);
const isOfferings = listOf(isOffering);
const JOB_POLL_MS = 3_000;
const SUMMARY_POLL_MS = 30_000;
const COST_POLL_MS = 30_000;

function unchanged<T>(current: T, next: T): T {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
}

function useVisibleInterval(delayMs: number | null, tick: () => void): void {
  useEffect(() => {
    if (delayMs === null) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const arm = () => {
      clearInterval(timer);
      timer = undefined;
      if (document.visibilityState === "hidden") return;
      timer = setInterval(tick, delayMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [delayMs, tick]);
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

  const refreshJobs = useCallback(async () => {
    const result = await api(`/api/jobs?limit=${JOB_LIST_LIMIT}`);
    if (!result.ok) {
      setJobsError(result.error);
      return;
    }
    if (!isJobs(result.body)) {
      setJobsError("Jobs could not be loaded.");
      return;
    }
    const next = result.body;
    setJobs((current) => unchanged(current, next));
    setJobsError("");
  }, []);

  const refreshSummary = useCallback(async () => {
    const [allowanceResult, summaryResult, offeringsResult, reconciliationResult] = await Promise.all([
      api("/api/allowance"),
      api(`/api/costs/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
      api("/api/offerings"),
      api("/api/reconciliation"),
    ]);
    setAllowance((current) => unchanged(current, allowanceResult.ok && isAllowance(allowanceResult.body) ? allowanceResult.body : null));
    setAllowanceError(allowanceResult.ok ? "" : allowanceResult.error);
    setSummary((current) => unchanged(current, summaryResult.ok && isCostSummary(summaryResult.body) ? summaryResult.body : null));
    setSummaryError(summaryResult.ok ? "" : summaryResult.error);
    setOfferings((current) => unchanged(current, offeringsResult.ok && isOfferings(offeringsResult.body) ? offeringsResult.body : []));
    setReconciliation((current) =>
      unchanged(current, reconciliationResult.ok && isReconciliation(reconciliationResult.body) ? reconciliationResult.body : null),
    );
    setReconciliationError(reconciliationResult.ok ? "" : reconciliationResult.error);
  }, [end, start]);

  const refresh = useCallback(async () => {
    await Promise.all([refreshJobs(), refreshSummary()]);
    setLoaded(true);
  }, [refreshJobs, refreshSummary]);

  const running = jobs.filter((job) => job.state === "running").length;
  const wasRunning = useRef(false);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useVisibleInterval(running > 0 ? JOB_POLL_MS : null, refreshJobs);
  useVisibleInterval(SUMMARY_POLL_MS, refresh);

  useEffect(() => {
    if (wasRunning.current && running === 0) void refreshSummary();
    wasRunning.current = running > 0;
  }, [refreshSummary, running]);

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
    refresh,
  };
}

export function costPollDelay(jobIds: readonly string[]): number | null {
  return jobIds.length > 0 ? COST_POLL_MS : null;
}

export function useJobCosts(ids: readonly string[], revision: string): ReadonlyMap<string, JobCost | null> {
  const idKey = ids.join("\n");
  const [costs, setCosts] = useState<ReadonlyMap<string, JobCost | null>>(new Map());

  useEffect(() => {
    const jobIds = idKey ? idKey.split("\n") : [];
    const delay = costPollDelay(jobIds);
    if (delay === null) return;
    const allowed = new Set(jobIds);
    let cancelled = false;
    let generation = 0;

    const load = () => {
      const request = ++generation;
      void Promise.all(jobIds.map(fetchJobCost)).then((rows) => {
        if (cancelled || request !== generation) return;
        setCosts((current) => mergeJobCosts(current, rows, allowed));
      });
    };

    load();
    const timer = setInterval(load, delay);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [idKey, revision]);

  const allowed = new Set(idKey ? idKey.split("\n") : []);
  return retainCosts(costs, allowed);
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
    if (allowed.has(id)) next.set(id, cost);
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
