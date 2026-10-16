"use client";

import Link from "next/link";

import { formatSubmitted, formatWindow, jobStateLabel, jobTitle, periodSpendUsd } from "@/lib/job-copy";
import { formatDisplayMoney, formatUsdDisplay } from "@/lib/money";
import type { SessionRole } from "@/lib/session-token";

import { useConsoleData } from "./use-console";

export function Overview({ actorId, role }: { readonly actorId: string | null; readonly role: SessionRole }) {
  const data = useConsoleData();
  const available = formatDisplayMoney(data.allowance?.available);
  const spend = formatUsdDisplay(periodSpendUsd(data.summary));
  const queued = data.jobs.filter((job) => job.state === "queued").length;
  const running = data.jobs.filter((job) => job.state === "running").length;
  const uncertain = data.jobs.filter((job) => job.state === "uncertain").length;
  const ordered = [...data.jobs].sort((left, right) => right.created_at.localeCompare(left.created_at));
  const recent = ordered.slice(0, 5);
  const failures = ordered.filter((job) => job.state === "failed").slice(0, 3);
  const period = data.summary ? formatWindow(data.summary.start, data.summary.end) : formatWindow(data.start, data.end);

  return (
    <>
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
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="kicker">
          Attention
        </h2>
        <dl className="stats">
          <div>
            <dt>Queued jobs</dt>
            <dd>{data.loaded ? queued : "Pending"}</dd>
          </div>
          <div>
            <dt>Running</dt>
            <dd data-tone={data.loaded && running > 0 ? "wait" : undefined}>{data.loaded ? running : "Pending"}</dd>
          </div>
          <div>
            <dt>Uncertain</dt>
            <dd>{data.loaded ? uncertain : "Pending"}</dd>
          </div>
          <div>
            <dt>
              <Link href="/billing">Available credit</Link>
            </dt>
            <dd title={available.exact}>{data.allowance ? available.text : data.allowanceError ? "Unavailable" : "Pending"}</dd>
          </div>
          <div>
            <dt>
              <Link href="/billing">Spend during selected period</Link>
            </dt>
            <dd title={spend.exact}>
              {data.summary ? spend.text : data.summaryError ? "Unavailable" : "Pending"}
              <span className="stat-note">{period}</span>
            </dd>
          </div>
          <div>
            <dt>
              <Link href="/billing">Jobs awaiting cost</Link>
            </dt>
            <dd>{data.summary ? data.summary.jobs_pending : data.summaryError ? "Unavailable" : "Pending"}</dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="failures-heading">
        <h2 id="failures-heading">Recent failures</h2>
        {failures.length === 0 ? (
          <p role="status">{data.loaded ? "No recent failures." : "Loading jobs"}</p>
        ) : (
          <ul className="recent">
            {failures.map((job) => {
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
        )}
      </section>
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">Five recent jobs</h2>
        {recent.length === 0 ? (
          <p role="status">
            {data.jobsError ? data.jobsError : data.loaded ? "No jobs yet." : "Loading jobs"} <Link href="/jobs/new">New job</Link>
          </p>
        ) : (
          <ul className="recent">
            {recent.map((job) => {
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
        )}
        <p>
          <Link href="/jobs">All jobs</Link>
        </p>
      </section>
    </>
  );
}
