"use client";

import { useEffect, useRef, useState } from "react";

import { isAllowance, isCostSummary, isJob, isJobCost, isOffering, isReconciliation, listOf } from "@/gyral/guards";
import { api } from "@/lib/client-api";
import type { Allowance, CostSummary, Job, JobCost, Offering, Reconciliation } from "@/lib/engine/types";
import { JOB_LIST_LIMIT } from "@/lib/job-history";
import { defaultCostWindow } from "@/lib/money";

const isJobs = listOf(isJob);
const isOfferings = listOf(isOffering);
const isJobCosts = listOf(isJobCost);

function unchanged<T>(current: T, next: T): T {
  return JSON.stringify(current) === JSON.stringify(next) ? current : next;
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
  const [costs, setCosts] = useState<ReadonlyMap<string, JobCost>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const summaryGeneration = useRef(0);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api(`/api/jobs?limit=${JOB_LIST_LIMIT}`),
      api("/api/allowance"),
      api("/api/offerings"),
      api("/api/reconciliation"),
      api("/api/job-costs"),
    ]).then(([jobsResult, allowanceResult, offeringsResult, reconciliationResult, costsResult]) => {
      if (!active) return;
      if (jobsResult.ok && isJobs(jobsResult.body)) {
        const next = jobsResult.body;
        setJobs((current) => unchanged(current, next));
        setJobsError("");
      } else {
        setJobsError(jobsResult.ok ? "Jobs could not be loaded." : jobsResult.error);
      }
      setAllowance((current) => unchanged(current, allowanceResult.ok && isAllowance(allowanceResult.body) ? allowanceResult.body : null));
      setAllowanceError(allowanceResult.ok ? "" : allowanceResult.error);
      setOfferings((current) => unchanged(current, offeringsResult.ok && isOfferings(offeringsResult.body) ? offeringsResult.body : []));
      setReconciliation((current) =>
        unchanged(current, reconciliationResult.ok && isReconciliation(reconciliationResult.body) ? reconciliationResult.body : null),
      );
      setReconciliationError(reconciliationResult.ok ? "" : reconciliationResult.error);
      if (costsResult.ok && isJobCosts(costsResult.body)) {
        setCosts(new Map(costsResult.body.map((cost) => [cost.job_id, cost])));
      }
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
      setSummary((current) => unchanged(current, summaryResult.ok && isCostSummary(summaryResult.body) ? summaryResult.body : null));
      setSummaryError(summaryResult.ok ? "" : summaryResult.error);
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
    costs,
    loaded,
  };
}
