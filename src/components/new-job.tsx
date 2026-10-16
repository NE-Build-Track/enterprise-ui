"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { GyralElement } from "@/components/GyralElement";
import { isOffering, isRunner, listOf } from "@/gyral/guards";
import { loadJobRunner, loadRunnerList } from "@/gyral/loaders";
import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { JobRequest, Offering, Runner } from "@/lib/engine/types";
import { rememberJobRequest, rememberJobResult } from "@/lib/job-request-memory";

const LAST_OFFERING_KEY = "lp-job-offering";
function subscribeOffering(): () => void {
  return () => {};
}

const isOfferings = listOf(isOffering);
const isRunners = listOf(isRunner);

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
    // Private browsing can reject storage. The form still works for this visit.
  }
}

function isJobRequest(value: unknown): value is JobRequest {
  return isRecord(value) && typeof value.app === "string";
}

export function NewJob({ app, again }: { readonly app: string; readonly again: boolean }) {
  const router = useRouter();
  const [offerings, setOfferings] = useState<readonly Offering[]>([]);
  const stored = useSyncExternalStore(subscribeOffering, readLastOffering, () => "");
  const remembered = app || stored;
  const [selected, setSelected] = useState(app);
  const [runners, setRunners] = useState<readonly Runner[]>([]);
  const [runnersError, setRunnersError] = useState("");

  useEffect(() => {
    void api("/api/offerings").then((result) => {
      if (result.ok && isOfferings(result.body)) setOfferings(result.body);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void api(`/api/runners?app=${encodeURIComponent(selected)}`).then((result) => {
      if (cancelled) return;
      setRunners(result.ok && isRunners(result.body) ? result.body : []);
      setRunnersError(result.ok ? "" : result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const onRunner = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail)) return;
      if (detail._tag === "OfferingRemembered" && typeof detail.app === "string") {
        writeLastOffering(detail.app);
      }
      if (detail._tag === "AppSelected" && typeof detail.app === "string") setSelected(detail.app);
      if (detail._tag === "JobCompleted" && typeof detail.jobId === "string") {
        if (detail.failed === true) return;
        if (detail.conflict !== true && isJobRequest(detail.request)) rememberJobRequest(detail.jobId, detail.request);
        if (isRecord(detail.result) && typeof detail.result.body === "string" && detail.result.body !== "") {
          rememberJobResult(detail.jobId, {
            body: detail.result.body,
            contentType: typeof detail.result.contentType === "string" ? detail.result.contentType : "",
            truncated: false,
          });
        }
        router.push(`/jobs/${detail.jobId}`);
      }
    },
    [router],
  );

  return (
    <div className="job-page">
      <hgroup>
        <h1>New job</h1>
        <p>Choose a task, fill in the inputs, then check the summary and run.</p>
      </hgroup>
      {again ? (
        <output>The original input is not kept on the job. Running here starts a new job and can incur a new charge.</output>
      ) : null}
      <article className="panel composer">
        <GyralElement tag="lp-job-runner" load={loadJobRunner} label="New job" props={{ offerings, remembered }} onOutput={onRunner} />
        {selected ? (
          <details>
            <summary>Runners</summary>
            <GyralElement tag="lp-runner-list" load={loadRunnerList} label="Runners" props={{ runners, error: runnersError }} />
          </details>
        ) : null}
      </article>
    </div>
  );
}
