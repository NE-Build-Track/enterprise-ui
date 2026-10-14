"use client";

import { useCallback, useEffect, useState } from "react";

import { GyralElement } from "@/components/GyralElement";
import { api } from "@/lib/client-api";
import type { ActorSnapshot } from "@/lib/attribution";
import { isRecord } from "@/lib/engine/errors";
import type { AccessKey, Job, JobCost, SyncReport } from "@/lib/engine/types";
import { isAccessKey, isActorSnapshot, isJob, isJobCost, listOf } from "@/gyral/guards";
import { loadActorTable, loadJobTimeline, loadKeyTable } from "@/gyral/loaders";

const isKeys = listOf(isAccessKey);
const isActors = listOf(isActorSnapshot);

export function OperatorDesk() {
  const [keys, setKeys] = useState<readonly AccessKey[]>([]);
  const [actors, setActors] = useState<readonly ActorSnapshot[]>([]);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [issued, setIssued] = useState<{ token: string; actorId: string } | null>(null);
  const [sync, setSync] = useState<SyncReport | null>(null);
  const [selected, setSelected] = useState<{ job: Job; cost: JobCost | null } | null>(null);

  const refresh = useCallback(async () => {
    const [keyResult, actorResult] = await Promise.all([api("/api/operator/keys"), api("/api/operator/actors")]);
    setKeys(keyResult.ok && isKeys(keyResult.body) ? keyResult.body : []);
    setActors(actorResult.ok && isActors(actorResult.body) ? actorResult.body : []);
    setError(keyResult.ok ? (actorResult.ok ? "" : actorResult.error) : keyResult.error);
  }, []);

  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(first);
  }, [refresh]);

  const onKeys = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail)) return;
      if (detail._tag === "IssueKey" && typeof detail.actorId === "string") {
        const actorId = detail.actorId;
        const label = typeof detail.label === "string" ? detail.label : "";
        void api("/api/operator/keys", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actorId, label }),
        }).then(async (result) => {
          if (!result.ok || !isRecord(result.body) || typeof result.body.token !== "string") {
            setError(result.ok ? "The engine did not return a key." : result.error);
            return;
          }
          setIssued({ token: result.body.token, actorId });
          setError("");
          await refresh();
        });
      }
      if (detail._tag === "RevokeKey" && typeof detail.keyId === "string") {
        void api(`/api/operator/keys/${detail.keyId}/revoke`, { method: "POST" }).then(async (result) => {
          if (!result.ok && result.status !== 204) {
            setError(result.error);
            return;
          }
          await refresh();
        });
      }
    },
    [refresh],
  );

  const onActors = useCallback((detail: unknown) => {
    if (!isRecord(detail) || detail._tag !== "LookupJob" || typeof detail.jobId !== "string") return;
    void api(`/api/operator/jobs/${detail.jobId}`).then((result) => {
      if (!result.ok || !isRecord(result.body) || !isJob(result.body.job)) {
        setLookupError(result.ok ? "Job not found." : result.error);
        setSelected(null);
        return;
      }
      setLookupError("");
      setSelected({ job: result.body.job, cost: isJobCost(result.body.cost) ? result.body.cost : null });
    });
  }, []);

  async function syncCosts(): Promise<void> {
    const result = await api("/api/operator/sync", { method: "POST" });
    if (!result.ok || !isRecord(result.body) || typeof result.body.pages !== "number") {
      setError(result.ok ? "Sync did not return a report." : result.error);
      return;
    }
    setSync({
      pages: result.body.pages,
      rows_seen: typeof result.body.rows_seen === "number" ? result.body.rows_seen : 0,
      rows_new: typeof result.body.rows_new === "number" ? result.body.rows_new : 0,
      jobs_updated: typeof result.body.jobs_updated === "number" ? result.body.jobs_updated : 0,
    });
    await refresh();
  }

  return (
    <>
      <hgroup>
        <h1>Operator</h1>
        <p>Every actor on the shared grant, plus key issue, revoke, and cost sync.</p>
      </hgroup>
      <div className="board">
        <article className="panel wide">
          <h2>Cost sync</h2>
          <div className="cluster">
            <button type="button" onClick={() => void syncCosts()}>
              Sync costs now
            </button>
            {sync ? (
              <output>
                {sync.pages} pages, {sync.rows_seen} rows seen, {sync.rows_new} new, {sync.jobs_updated} jobs updated.
              </output>
            ) : null}
          </div>
          <p className="note">Fund, pause, rotate, and revoke for allocations stay on the engine until those routes are ready.</p>
        </article>
        <article className="panel wide">
          <h2>Spend by actor</h2>
          <GyralElement
            tag="lp-actor-attribution-table"
            load={loadActorTable}
            label="Actor attribution"
            props={{ actors, error, lookupError }}
            onOutput={onActors}
          />
        </article>
        <article className="panel wide">
          <h2>Access keys</h2>
          <GyralElement tag="lp-key-table" load={loadKeyTable} label="Keys" props={{ keys, error, issued }} onOutput={onKeys} />
        </article>
        <article className="panel wide">
          <h2>Looked-up job</h2>
          <GyralElement
            tag="lp-job-timeline"
            load={loadJobTimeline}
            label="Looked-up job"
            props={{ job: selected?.job ?? null, cost: selected?.cost ?? null, error: lookupError, usageError: "" }}
          />
        </article>
      </div>
    </>
  );
}
