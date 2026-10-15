"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { GyralElement } from "@/components/GyralElement";
import {
  loadAllowanceMeter,
  loadCostBreakdown,
  loadJobList,
  loadJobRunner,
  loadJobTimeline,
  loadReconciliationCard,
  loadRunnerList,
} from "@/gyral/loaders";
import { isAllowance, isCostSummary, isJob, isJobCost, isOffering, isReconciliation, isRunner, listOf } from "@/gyral/guards";
import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { Allowance, CostSummary, Job, JobCost, Offering, Reconciliation, Runner } from "@/lib/engine/types";
import { defaultCostWindow, formatMoney, formatUsd, sumDecimals } from "@/lib/money";
import type { SessionRole } from "@/lib/session-token";

const isJobs = listOf(isJob);
const isOfferings = listOf(isOffering);
const isRunners = listOf(isRunner);

const SPENT_CLASSES = ["delivered", "failed_after_payment", "uncertain"] as const;
const JOB_POLL_MS = 3_000;
const SUMMARY_POLL_MS = 30_000;
const LAST_OFFERING_KEY = "lp-job-offering";

function readLastOffering(): string {
  try {
    return localStorage.getItem(LAST_OFFERING_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeLastOffering(app: string): void {
  try {
    if (app) localStorage.setItem(LAST_OFFERING_KEY, app);
    else localStorage.removeItem(LAST_OFFERING_KEY);
  } catch {
    // Private browsing can reject storage. The form still defaults for this visit.
  }
}

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
      timer = setInterval(() => void tick(), delayMs);
    };
    arm();
    document.addEventListener("visibilitychange", arm);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", arm);
    };
  }, [delayMs, tick]);
}

function openBilling(): void {
  const billing = document.getElementById("billing");
  if (billing instanceof HTMLDetailsElement) billing.open = true;
}

function spentInWindow(summary: CostSummary | null): string {
  if (!summary) return "pending";
  const amounts = SPENT_CLASSES.map((name) => summary.by_class[name]?.fee_usd ?? null);
  if (amounts.every((amount) => amount === null)) return "no USD price";
  return formatUsd(sumDecimals(amounts.map((amount) => amount ?? "0")));
}

function reconciliationStat(reconciliation: Reconciliation | null): { readonly label: string; readonly tone: "ok" | "bad" | "wait" } {
  if (reconciliation?.balanced === true) return { label: "Balanced", tone: "ok" };
  if (reconciliation?.balanced === false) return { label: "Unbalanced", tone: "bad" };
  return { label: "Unavailable", tone: "wait" };
}

export function Dashboard({ actorId, role }: { readonly actorId: string | null; readonly role: SessionRole }) {
  const initialWindow = useMemo(() => defaultCostWindow(), []);
  const [start, setStart] = useState(initialWindow.start);
  const [end, setEnd] = useState(initialWindow.end);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [allowanceError, setAllowanceError] = useState("");
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  const [jobs, setJobs] = useState<readonly Job[]>([]);
  const [jobsError, setJobsError] = useState("");
  const [offerings, setOfferings] = useState<readonly Offering[]>([]);
  const [remembered, setRemembered] = useState<string | null>(null);
  const [app, setApp] = useState("");
  const [runners, setRunners] = useState<readonly Runner[]>([]);
  const [runnersError, setRunnersError] = useState("");
  const [runnersLoading, setRunnersLoading] = useState(false);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [reconciliationError, setReconciliationError] = useState("");
  const [selected, setSelected] = useState<{ job: Job; cost: JobCost | null } | null>(null);
  const [usageError, setUsageError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const refreshJobs = useCallback(async () => {
    const result = await api("/api/jobs?limit=50");
    setJobs((current) => unchanged(current, result.ok && isJobs(result.body) ? result.body : []));
    setJobsError(result.ok ? "" : result.error);
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

  useLayoutEffect(() => {
    setRemembered(readLastOffering());
  }, []);

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

  useEffect(() => {
    if (!app) return;
    let cancelled = false;
    void api(`/api/runners?app=${encodeURIComponent(app)}`).then((result) => {
      if (cancelled) return;
      setRunners(result.ok && isRunners(result.body) ? result.body : []);
      setRunnersError(result.ok ? "" : result.error);
      setRunnersLoading(false);
    });
    return () => {
      cancelled = true;
    };
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
      if (detail._tag === "OfferingRemembered" && typeof detail.app === "string") {
        writeLastOffering(detail.app);
        setRemembered(detail.app);
      }
      if (detail._tag === "AppSelected" && typeof detail.app === "string") {
        setApp(detail.app);
        setRunners([]);
        setRunnersError("");
        setRunnersLoading(detail.app !== "");
      }
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

  const pending = jobs.filter((job) => job.state === "queued" || job.state === "uncertain").length;
  const balance = reconciliationStat(reconciliation);
  const allowanceTone = allowance?.status === "active" ? "ok" : allowance ? "wait" : undefined;

  return (
    <>
      <hgroup>
        <h1>Dashboard</h1>
        <p>
          Allowance, costs, and jobs for <bdi>{actorId ?? "this key"}</bdi>.
          {role === "operator" && !actorId ? (
            <>
              {" "}
              <Link href="/operator">Provision an actor</Link> on the operator desk, then sign in with the key it issues.
            </>
          ) : null}
        </p>
      </hgroup>
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="kicker">
          Overview
        </h2>
        <dl className="stats">
          <div>
            <dt>
              <a href="#allowance" onClick={openBilling}>
                Available
              </a>
            </dt>
            <dd data-tone={allowanceTone}>{allowance ? formatMoney(allowance.available) : allowanceError ? "Unavailable" : "pending"}</dd>
          </div>
          <div>
            <dt>
              <a href="#costs" onClick={openBilling}>
                Spent in window
              </a>
            </dt>
            <dd>{summary ? spentInWindow(summary) : summaryError ? "Unavailable" : "pending"}</dd>
          </div>
          <div>
            <dt>
              <a href="#jobs">Running</a>
            </dt>
            <dd data-tone={loaded && running > 0 ? "wait" : undefined}>
              {!loaded ? "pending" : jobsError && jobs.length === 0 ? "Unavailable" : running}
              {loaded && !(jobsError && jobs.length === 0) ? <span className="stat-note">{pending} pending</span> : null}
            </dd>
          </div>
          <div>
            <dt>
              <a href="#reconciliation" onClick={openBilling}>
                Reconciliation
              </a>
            </dt>
            <dd>
              {loaded ? (
                <strong className="chip" data-tone={balance.tone}>
                  {balance.label}
                </strong>
              ) : (
                "pending"
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="run-heading">
        <h2 id="run-heading">Run a job</h2>
        <article className="panel">
          <GyralElement tag="lp-job-runner" load={loadJobRunner} label="Job runner" props={{ offerings, remembered }} onOutput={onRunner} />
          {app ? (
            <>
              <h3>Available runners</h3>
              {runnersLoading ? (
                <p role="status">Loading runners</p>
              ) : (
                <GyralElement tag="lp-runner-list" load={loadRunnerList} label="Runners" props={{ runners, error: runnersError }} />
              )}
            </>
          ) : null}
        </article>
      </section>
      <section id="jobs" className="split" aria-labelledby="jobs-heading">
        <h2 id="jobs-heading">Jobs</h2>
        <div className="panel">
          <div>
            <GyralElement
              tag="lp-job-list"
              load={loadJobList}
              label="Jobs"
              props={{ jobs, error: jobsError, selectedId: selected?.job.id ?? "" }}
              onOutput={onList}
            />
          </div>
          <div className="detail">
            <h3>Selected job</h3>
            <GyralElement
              tag="lp-job-timeline"
              load={loadJobTimeline}
              label="Job timeline"
              props={{ job: selected?.job ?? null, cost: selected?.cost ?? null, error: "", usageError }}
              onOutput={onUsage}
            />
          </div>
        </div>
      </section>
      <details id="billing" className="section" open aria-labelledby="billing-heading">
        <summary id="billing-heading">Billing</summary>
        <div className="board">
          <article id="allowance" className="panel">
            <h2>Allowance</h2>
            <GyralElement tag="lp-allowance-meter" load={loadAllowanceMeter} label="Allowance" props={{ allowance, error: allowanceError }} />
          </article>
          <article id="costs" className="panel">
            <h2>Cost by class</h2>
            <GyralElement
              tag="lp-cost-breakdown"
              load={loadCostBreakdown}
              label="Costs"
              props={{ summary, error: summaryError, start, end }}
              onOutput={onRange}
            />
          </article>
          <article id="reconciliation" className="panel wide">
            <h2>Reconciliation</h2>
            <GyralElement
              tag="lp-reconciliation-card"
              load={loadReconciliationCard}
              label="Reconciliation"
              props={{ reconciliation, error: reconciliationError }}
            />
          </article>
        </div>
      </details>
    </>
  );
}
