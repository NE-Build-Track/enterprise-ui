"use client";

import Link from "next/link";
import { useMemo } from "react";

import { GyralElement } from "@/components/GyralElement";
import { loadAllowanceMeter, loadCostBreakdown, loadReconciliationCard } from "@/gyral/loaders";
import { isRecord } from "@/lib/engine/errors";
import { COST_CLASSES, type CostClass } from "@/lib/engine/types";
import { formatWindow, jobTitle, periodSpendUsd } from "@/lib/job-copy";
import { billingCostJobs, inWindow, jobsForClass } from "@/lib/job-history";
import { feePositive, formatDisplayMoney, formatUsdDisplay } from "@/lib/money";

import { useConsoleData, useJobCosts } from "./use-console";

const CLASS_LABELS: Record<CostClass, string> = {
  delivered: "Delivered",
  failed_after_payment: "Failed after payment",
  uncertain: "Uncertain",
  pending: "Awaiting finalization",
};

export function Billing() {
  const data = useConsoleData();
  const available = formatDisplayMoney(data.allowance?.available);
  const used = formatDisplayMoney(data.allowance?.spent);
  const spend = formatUsdDisplay(periodSpendUsd(data.summary));
  const period = data.summary ? formatWindow(data.summary.start, data.summary.end) : formatWindow(data.start, data.end);
  const windowJobs = useMemo(() => {
    const matched = data.jobs.filter((job) => inWindow(job, data.start, data.end));
    return [...matched].sort((left, right) => right.created_at.localeCompare(left.created_at));
  }, [data.end, data.jobs, data.start]);
  const priced = billingCostJobs(windowJobs);
  const pricedJobs = priced.jobs;
  const { costs, costsError } = useJobCosts(pricedJobs.map((job) => job.id));
  const loadedCount = pricedJobs.filter((job) => costs.has(job.id)).length;
  const costsReady = pricedJobs.length === 0 || loadedCount === pricedJobs.length;
  const outside = priced.truncated;

  const onRange = (detail: unknown) => {
    if (!isRecord(detail) || detail._tag !== "RangeChanged") return;
    if (typeof detail.start === "string" && detail.start) data.setStart(detail.start);
    if (typeof detail.end === "string" && detail.end) data.setEnd(detail.end);
  };

  return (
    <>
      <hgroup>
        <h1>Billing</h1>
        <p>Available credit, allowance used, and spend for a labeled period.</p>
      </hgroup>
      <dl className="stats">
        <div>
          <dt>Available credit</dt>
          <dd title={available.exact}>{data.allowance ? available.text : data.allowanceError || "Pending"}</dd>
        </div>
        <div>
          <dt>Total allowance used</dt>
          <dd title={used.exact}>{data.allowance ? used.text : data.allowanceError || "Pending"}</dd>
        </div>
        <div>
          <dt>Spend during selected period</dt>
          <dd title={spend.exact}>
            {data.summary ? spend.text : data.summaryError || "Pending"}
            <span className="stat-note">{period}</span>
          </dd>
        </div>
        <div>
          <dt>Jobs awaiting cost</dt>
          <dd>
            {data.summary ? data.summary.jobs_pending : data.summaryError || "Pending"}
            <span className="stat-note">Not the same as queued jobs</span>
          </dd>
        </div>
      </dl>
      <div className="stack">
        <article className="panel">
          <h2>Allowance</h2>
          <GyralElement tag="lp-allowance-meter" load={loadAllowanceMeter} label="Allowance" props={{ allowance: data.allowance, error: data.allowanceError }} />
        </article>
        <article className="panel">
          <h2>Cost breakdown</h2>
          <GyralElement
            tag="lp-cost-breakdown"
            load={loadCostBreakdown}
            label="Costs"
            props={{ summary: data.summary, error: data.summaryError, start: data.start, end: data.end }}
            onOutput={onRange}
          />
          <table className="breakdown">
            <caption>Loaded jobs for {period}</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Amount</th>
                <th scope="col">Jobs</th>
              </tr>
            </thead>
            <tbody>
              {COST_CLASSES.map((name) => {
                const display = formatUsdDisplay(data.summary?.by_class[name]?.fee_usd);
                const matches = jobsForClass(pricedJobs, costs, name);
                return (
                  <tr key={name}>
                    <th scope="row">{CLASS_LABELS[name]}</th>
                    <td title={display.exact}>{data.summary ? display.text : "Pending"}</td>
                    <td>{jobLinks(matches, outside, costsReady)}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row">Unattributed</th>
                <td title={formatUsdDisplay(data.reconciliation?.unattributed.fee_usd).exact}>
                  {formatUsdDisplay(data.reconciliation?.unattributed.fee_usd).text}
                </td>
                <td>Not tied to a loaded job</td>
              </tr>
            </tbody>
          </table>
          {feePositive(data.reconciliation?.unattributed) ? (
            <p>Unattributed spend was not tied to a job. Balanced can still be true when this amount is included in the comparison.</p>
          ) : (
            <p>Unattributed is spend that was not tied to a job.</p>
          )}
          {costsError ? <p role="alert">{costsError}</p> : null}
          {outside ? <p>Some jobs in this period are outside the loaded cost detail.</p> : null}
        </article>
        <article className="panel">
          <h2>Reconciliation</h2>
          <GyralElement
            tag="lp-reconciliation-card"
            load={loadReconciliationCard}
            label="Reconciliation"
            props={{ reconciliation: data.reconciliation, error: data.reconciliationError }}
          />
        </article>
      </div>
    </>
  );
}

function jobLinks(
  jobs: readonly { id: string; app: string; operation_ref: string | null }[],
  outside: boolean,
  costsReady: boolean,
) {
  if (!costsReady) return "Loading cost detail";
  if (jobs.length === 0) return outside ? "Outside the loaded history" : "No loaded job is in this category";
  return (
    <ul className="recent">
      {jobs.map((job) => {
        const title = jobTitle(job);
        return (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`}>
              {title.name} <span className="muted">{title.detail}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
