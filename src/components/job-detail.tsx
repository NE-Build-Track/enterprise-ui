"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { GyralElement } from "@/components/GyralElement";
import { isAllowance, isJob, isJobCost } from "@/gyral/guards";
import { loadJobTimeline } from "@/gyral/loaders";
import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { Job, JobCost, JobRequest } from "@/lib/engine/types";
import { billingCurrency, type BillingCurrency } from "@/lib/job-copy";
import { recallJobRequest, recallJobResult, rememberJobRequest, rememberJobResult, type StoredJobResult } from "@/lib/job-request-memory";

export function JobDetail({ id }: { readonly id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [cost, setCost] = useState<JobCost | null>(null);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [repeating, setRepeating] = useState(false);
  const [currency, setCurrency] = useState<BillingCurrency>("USD");
  const [printed, setPrinted] = useState<StoredJobResult | null>(null);
  const repeatingRef = useRef(false);

  const load = useCallback(async () => {
    const result = await api(`/api/jobs/${id}`);
    if (!result.ok || !isRecord(result.body) || !isJob(result.body.job)) {
      setError(result.ok ? "This job could not be loaded." : result.error);
      return;
    }
    setJob(result.body.job);
    setCost(isJobCost(result.body.cost) ? result.body.cost : null);
    setError("");
  }, [id]);

  useEffect(() => {
    setPrinted(recallJobResult(id));
  }, [id]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    void api("/api/allowance").then((result) => {
      if (result.ok && isAllowance(result.body)) {
        setCurrency(billingCurrency(result.body.available, result.body.spent, result.body.granted));
      }
    });
    return () => clearTimeout(first);
  }, [load]);

  useEffect(() => {
    if (!job || (job.state !== "running" && job.state !== "queued")) return;
    const timer = setInterval(() => void load(), 3_000);
    return () => clearInterval(timer);
  }, [job, load]);

  const repeat = useCallback(
    async (current: Job) => {
      if (repeatingRef.current) return;
      repeatingRef.current = true;
      const saved = recallJobRequest(current.id);
      if (!saved) {
        repeatingRef.current = false;
        router.push(`/jobs/new?app=${encodeURIComponent(current.app)}&again=1`);
        return;
      }
      setRepeating(true);
      const request: JobRequest = { ...saved, operation_ref: `job-${crypto.randomUUID()}` };
      const result = await api("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      });
      repeatingRef.current = false;
      setRepeating(false);
      const nextId = jobIdFrom(result.body);
      if (nextId) {
        rememberJobRequest(nextId, request);
        const carried = carriedResult(result.body);
        if (carried) rememberJobResult(nextId, carried);
        router.push(`/jobs/${nextId}`);
        return;
      }
      setError(result.ok ? "The new job did not return an id." : result.error);
    },
    [router],
  );

  const onOutput = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail) || !job) return;
      if (detail._tag === "RunAgain") {
        void repeat(job);
        return;
      }
      if (detail._tag !== "ReportUsage" || !isRecord(detail.quantities)) return;
      const quantities: Record<string, number> = {};
      for (const [key, value] of Object.entries(detail.quantities)) {
        if (typeof value === "number") quantities[key] = value;
      }
      void api(`/api/jobs/${job.id}/usage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quantities }),
      }).then(async (result) => {
        if (!result.ok) {
          setUsageError(result.error);
          return;
        }
        setUsageError("");
        await load();
      });
    },
    [job, load, repeat],
  );

  const storedFile = job?.result?.storage === "stored";
  const showResult = printed !== null || job?.state === "succeeded" || storedFile;

  return (
    <div className="job-page">
      <p>
        <Link href="/jobs">Jobs</Link>
      </p>
      <h1>Job</h1>
      {error ? <p role="alert">{error}</p> : null}
      <article className="panel">
        <GyralElement
          tag="lp-job-timeline"
          load={loadJobTimeline}
          label="Job"
          props={{ job, cost, error, usageError, currency, repeat: job?.state === "failed", repeating }}
          onOutput={onOutput}
        />
        {showResult ? (
          <section id="result" aria-labelledby="result-heading">
            <h2 id="result-heading">Result</h2>
            {printed ? (
              <label>
                Output
                {printed.contentType ? <span className="muted">{printed.contentType}</span> : null}
                <textarea className="result-field" readOnly spellCheck={false} value={formatResult(printed.body)} />
              </label>
            ) : (
              <p>This browser does not have the result from when the job ran.</p>
            )}
          </section>
        ) : null}
        {storedFile ? (
          <p>
            <a href={`/api/jobs/${id}/result`} download>
              Download output
            </a>
          </p>
        ) : null}
      </article>
    </div>
  );
}

function formatResult(body: string): string {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function carriedResult(body: unknown): StoredJobResult | null {
  if (!isRecord(body) || typeof body.body !== "string" || body.body === "") return null;
  return {
    body: body.body,
    contentType: typeof body.contentType === "string" ? body.contentType : "",
  };
}

function jobIdFrom(body: unknown): string | null {
  if (!isRecord(body)) return null;
  if (typeof body.jobId === "string") return body.jobId;
  if (isJob(body.job)) return body.job.id;
  return null;
}
