"use client";

import Link from "next/link";

import type { Job } from "@/lib/engine/types";
import { formatSubmitted, formatWindow, jobStateLabel, jobTitle, periodSpendUsd } from "@/lib/job-copy";
import { formatDisplayMoney, formatUsdDisplay } from "@/lib/money";
import type { SessionRole } from "@/lib/session-token";

import { useConsoleData } from "./use-console";

type ConsoleData = ReturnType<typeof useConsoleData>;

function countText(loaded: boolean, count: number): number | "Pending" {
  return loaded ? count : "Pending";
}

function metricText<T extends string | number>(present: boolean, error: string, value: T): T | "Unavailable" | "Pending" {
  if (present) return value;
  if (error) return "Unavailable";
  return "Pending";
}

function emptyJobsCopy(error: string, loaded: boolean): string {
  if (error) return error;
  return loaded ? "No jobs yet." : "Loading jobs";
}

function OverviewIntro({ actorId, role }: { readonly actorId: string | null; readonly role: SessionRole }) {
  return (
    <hgroup>
      <h1>Overview</h1>
      <p>
        What needs attention for <bdi>{actorId ?? "this key"}</bdi>.
        {role === "operator" && !actorId ? (
          <>
            {" "}
            <Link href="/operator">Provision an actor</Link> on the operator desk, then sign in with the key it issues.
          </>
        ) : null}
      </p>
    </hgroup>
  );
}

function Attention({
  data,
  queued,
  running,
  uncertain,
}: {
  readonly data: ConsoleData;
  readonly queued: number;
  readonly running: number;
  readonly uncertain: number;
}) {
  const available = formatDisplayMoney(data.allowance?.available);
  const spend = formatUsdDisplay(periodSpendUsd(data.summary));
  const period = data.summary ? formatWindow(data.summary.start, data.summary.end) : formatWindow(data.start, data.end);
  const runningTone = data.loaded && running > 0 ? "wait" : undefined;
  const pendingJobs = data.summary?.jobs_pending ?? 0;

  return (
    <section aria-labelledby="attention-heading">
      <h2 id="attention-heading" className="kicker">
        Attention
      </h2>
      <dl className="stats">
        <div>
          <dt>Queued jobs</dt>
          <dd>{countText(data.loaded, queued)}</dd>
        </div>
        <div>
          <dt>Running</dt>
          <dd data-tone={runningTone}>{countText(data.loaded, running)}</dd>
        </div>
        <div>
          <dt>Uncertain</dt>
          <dd>{countText(data.loaded, uncertain)}</dd>
        </div>
        <div>
          <dt>
            <Link href="/billing">Available credit</Link>
          </dt>
          <dd title={available.exact}>{metricText(data.allowance !== null, data.allowanceError, available.text)}</dd>
        </div>
        <div>
          <dt>
            <Link href="/billing">Spend during selected period</Link>
          </dt>
          <dd title={spend.exact}>
            {metricText(data.summary !== null, data.summaryError, spend.text)}
            <span className="stat-note">{period}</span>
          </dd>
        </div>
        <div>
          <dt>
            <Link href="/billing">Jobs awaiting cost</Link>
          </dt>
          <dd>{metricText(data.summary !== null, data.summaryError, pendingJobs)}</dd>
        </div>
      </dl>
    </section>
  );
}

function FailureList({ jobs }: { readonly jobs: readonly Job[] }) {
  return (
    <ul className="recent">
      {jobs.map((job) => {
        const title = jobTitle(job);
        return (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`}>{title.name}</Link>
            <span>{jobStateLabel(job.state)}</span>
            <time dateTime={job.created_at}>{formatSubmitted(job.created_at)}</time>
          </li>
        );
      })}
    </ul>
  );
}

function RecentFailures({ jobs, loaded }: { readonly jobs: readonly Job[]; readonly loaded: boolean }) {
  return (
    <section aria-labelledby="failures-heading">
      <h2 id="failures-heading">Recent failures</h2>
      {jobs.length === 0 ? <output>{loaded ? "No recent failures." : "Loading jobs"}</output> : <FailureList jobs={jobs} />}
    </section>
  );
}

function RecentList({ jobs }: { readonly jobs: readonly Job[] }) {
  return (
    <ul className="recent">
      {jobs.map((job) => {
        const title = jobTitle(job);
        return (
          <li key={job.id}>
            <Link href={`/jobs/${job.id}`}>
              {title.name} <span className="muted">{title.detail}</span>
            </Link>
            <span>{jobStateLabel(job.state)}</span>
            <time dateTime={job.created_at}>{formatSubmitted(job.created_at)}</time>
          </li>
        );
      })}
    </ul>
  );
}

function RecentJobs({ jobs, error, loaded }: { readonly jobs: readonly Job[]; readonly error: string; readonly loaded: boolean }) {
  return (
    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Five recent jobs</h2>
      {jobs.length === 0 ? (
        <output>
          {emptyJobsCopy(error, loaded)} <Link href="/jobs/new">New job</Link>
        </output>
      ) : (
        <RecentList jobs={jobs} />
      )}
      <p>
        <Link href="/jobs">All jobs</Link>
      </p>
    </section>
  );
}

export function Overview({ actorId, role }: { readonly actorId: string | null; readonly role: SessionRole }) {
  const data = useConsoleData();
  const queued = data.jobs.filter((job) => job.state === "queued").length;
  const running = data.jobs.filter((job) => job.state === "running").length;
  const uncertain = data.jobs.filter((job) => job.state === "uncertain").length;
  const ordered = [...data.jobs].sort((left, right) => right.created_at.localeCompare(left.created_at));

  return (
    <>
      <OverviewIntro actorId={actorId} role={role} />
      <Attention data={data} queued={queued} running={running} uncertain={uncertain} />
      <RecentFailures jobs={ordered.filter((job) => job.state === "failed").slice(0, 3)} loaded={data.loaded} />
      <RecentJobs jobs={ordered.slice(0, 5)} error={data.jobsError} loaded={data.loaded} />
    </>
  );
}
