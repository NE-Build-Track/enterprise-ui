"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { GyralElement } from "@/components/GyralElement";
import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { Allowance, CostSummary, Job, JobCost, Offering, Reconciliation, Runner } from "@/lib/engine/types";
import { defaultCostWindow } from "@/lib/money";
import {
  isAllowance,
  isCostSummary,
  isJob,
  isJobCost,
  isOffering,
  isReconciliation,
  isRunner,
  listOf,
} from "@/gyral/guards";
import {
  loadAllowanceMeter,
  loadCostBreakdown,
  loadJobList,
  loadJobRunner,
  loadJobTimeline,
  loadReconciliationCard,
  loadRunnerList,
} from "@/gyral/loaders";

const isJobs = listOf(isJob);
const isOfferings = listOf(isOffering);
const isRunners = listOf(isRunner);

export function Dashboard({ actorId }: { readonly actorId: string | null }) {
  const window = useMemo(() => defaultCostWindow(), []);
  const [start, setStart] = useState(window.start);
  const [end, setEnd] = useState(window.end);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [allowanceError, setAllowanceError] = useState("");
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const [jobsError, setJobsError] = useState("");
  const [offerings, setOfferings] = useState<readonly Offering[]>([]);
  const [app, setApp] = useState("");
  const [runners, setRunners] = useState<readonly Runner[]>([]);
  const [runnersError, setRunnersError] = useState("");
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [selected, setSelected] = useState<{ job: Job; cost: JobCost | null } | null>(null);
  const [usageError, setUsageError] = useState("");

  const refresh = useCallback(async () => {
    const [allowanceResult, summaryResult, jobsResult, offeringsResult, reconciliationResult] = await Promise.all([
      api("/api/allowance"),
      api(`/api/costs/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`),
      api("/api/jobs?limit=50"),
      api("/api/offerings"),
      api("/api/reconciliation"),
    ]);
    setAllowance(allowanceResult.ok && isAllowance(allowanceResult.body) ? allowanceResult.body : null);
    setAllowanceError(allowanceResult.ok ? "" : allowanceResult.error);
    setSummary(summaryResult.ok && isCostSummary(summaryResult.body) ? summaryResult.body : null);
    setSummaryError(summaryResult.ok ? "" : summaryResult.error);
    setJobs(jobsResult.ok && isJobs(jobsResult.body) ? jobsResult.body : []);
    setJobsError(jobsResult.ok ? "" : jobsResult.error);
    setOfferings(offeringsResult.ok && isOfferings(offeringsResult.body) ? offeringsResult.body : []);
    setReconciliation(reconciliationResult.ok && isReconciliation(reconciliationResult.body) ? reconciliationResult.body : null);
    setReconciliationError(
      reconciliationResult.ok ? "" : actorId ? reconciliationResult.error : "This key was not issued here, so reconciliation needs an actor id.",
    );
  }, [actorId, end, start]);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    if (!jobs.some((job) => job.state === "running")) {
      return () => clearTimeout(first);
    }
    const timer = setInterval(() => void refresh(), 3000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [jobs, refresh]);

  useEffect(() => {
    if (!app) return;
    void api(`/api/runners?app=${encodeURIComponent(app)}`).then((result) => {
      setRunners(result.ok && isRunners(result.body) ? result.body : []);
      setRunnersError(result.ok ? "" : result.error);
    });
  }, [app]);

  const openJob = useCallback(async (id: string) => {
    const result = await api(`/api/jobs/${id}`);
    if (!result.ok || !isRecord(result.body) || !isJob(result.body.job)) return;
    setSelected({ job: result.body.job, cost: isJobCost(result.body.cost) ? result.body.cost : null });
    setUsageError("");
  }, []);

  const onRunner = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail)) return;
      if (detail._tag === "AppSelected" && typeof detail.app === "string") setApp(detail.app);
      if (detail._tag === "JobCompleted") {
        void refresh();
        if (typeof detail.jobId === "string") void openJob(detail.jobId);
      }
    },
    [openJob, refresh],
  );

  const onList = useCallback(
    (detail: unknown) => {
      if (isRecord(detail) && detail._tag === "OpenJob" && typeof detail.id === "string") void openJob(detail.id);
    },
    [openJob],
  );

  const onRange = useCallback((detail: unknown) => {
    if (!isRecord(detail) || detail._tag !== "RangeChanged") return;
    if (typeof detail.start === "string" && detail.start) setStart(detail.start);
    if (typeof detail.end === "string" && detail.end) setEnd(detail.end);
  }, []);

  const onUsage = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail) || detail._tag !== "ReportUsage" || !isRecord(detail.quantities) || !selected) return;
      const quantities: Record<string, number> = {};
      for (const [key, value] of Object.entries(detail.quantities)) {
        if (typeof value === "number") quantities[key] = value;
      }
      void api(`/api/jobs/${selected.job.id}/usage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantities }),
      }).then(async (result) => {
        if (!result.ok) {
          setUsageError(result.error);
          return;
        }
        setUsageError("");
        await openJob(selected.job.id);
      });
    },
    [openJob, selected],
  );

  return (
    <>
      <hgroup>
        <h1>Dashboard</h1>
        <p>
          Allowance, costs, runners, and jobs for <bdi>{actorId ?? "this key"}</bdi>.
        </p>
      </hgroup>
      <div className="board">
        <article className="panel">
          <h2>Allowance</h2>
          <GyralElement tag="lp-allowance-meter" load={loadAllowanceMeter} label="Allowance" props={{ allowance, error: allowanceError }} />
        </article>
        <article className="panel">
          <h2>Cost by class</h2>
          <GyralElement
            tag="lp-cost-breakdown"
            load={loadCostBreakdown}
            label="Costs"
            props={{ summary, error: summaryError, start, end }}
            onOutput={onRange}
          />
        </article>
        <article className="panel wide">
          <h2>Run a job</h2>
          <GyralElement
            tag="lp-job-runner"
            load={loadJobRunner}
            label="Job runner"
            props={{ offerings }}
            onOutput={onRunner}
          />
        </article>
        <article className="panel wide">
          <h2>Runners</h2>
          <GyralElement tag="lp-runner-list" load={loadRunnerList} label="Runners" props={{ runners, error: runnersError }} />
        </article>
        <article className="panel wide">
          <h2>Jobs</h2>
          <GyralElement tag="lp-job-list" load={loadJobList} label="Jobs" props={{ jobs, error: jobsError, selectedId: selected?.job.id ?? "" }} onOutput={onList} />
        </article>
        <article className="panel wide">
          <h2>Job</h2>
          <GyralElement
            tag="lp-job-timeline"
            load={loadJobTimeline}
            label="Job timeline"
            props={{ job: selected?.job ?? null, cost: selected?.cost ?? null, error: "", usageError }}
            onOutput={onUsage}
          />
        </article>
        <article className="panel wide">
          <h2>Reconciliation</h2>
          <GyralElement
            tag="lp-reconciliation-card"
            load={loadReconciliationCard}
            label="Reconciliation"
            props={{ reconciliation, error: reconciliationError }}
          />
        </article>
      </div>
    </>
  );
}
