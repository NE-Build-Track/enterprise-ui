"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

import { GyralElement } from "@/components/GyralElement";
import { api } from "@/lib/client-api";
import type { ActorSnapshot } from "@/lib/attribution";
import { isRecord } from "@/lib/engine/errors";
import type { AccessKey, Job, JobCost, ProvisionedActor, SyncReport } from "@/lib/engine/types";
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
  const [actorId, setActorId] = useState("");
  const [amount, setAmount] = useState("1");
  const [label, setLabel] = useState("");
  const [fundAmount, setFundAmount] = useState("1");
  const [allocation, setAllocation] = useState<ProvisionedActor | null>(null);
  const [allocationError, setAllocationError] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

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

  const dismissIssued = useCallback(() => {
    setIssued(null);
  }, []);

  useEffect(() => {
    const drop = () => {
      flushSync(dismissIssued);
      const field = document.querySelector("lp-key-table")?.shadowRoot?.querySelector("#issued-key");
      if (field instanceof HTMLInputElement) {
        field.value = "";
        field.remove();
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) drop();
    };
    window.addEventListener("pagehide", drop);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("pagehide", drop);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [dismissIssued]);

  const onKeys = useCallback(
    (detail: unknown) => {
      if (!isRecord(detail)) return;
      if (detail._tag === "IssueKey" && typeof detail.actorId === "string") {
        const actorId = detail.actorId;
        const label = typeof detail.label === "string" ? detail.label : "";
        void api("/api/operator/keys", {
          method: "POST",
          cache: "no-store",
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
      if (detail._tag === "DismissKey") {
        dismissIssued();
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
    [dismissIssued, refresh],
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

  async function allocationCommand(
    action: "provision" | "fund" | "pause" | "resume" | "revoke" | "rotate",
    payload: { actorId: string; amount?: string; label?: string },
  ): Promise<void> {
    const result = await api("/api/operator/allocations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!result.ok || !isProvisioned(result.body)) {
      setAllocationError(result.ok ? "The engine did not return an allocation." : result.error);
      return;
    }
    setAllocation(result.body);
    setActorId(result.body.actor_id);
    setAllocationError("");
    setConfirmRevoke(false);
    await refresh();
  }

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
        <p>Provision an allocation, issue that actor a key, then compare spend.</p>
      </hgroup>
      <div className="board">
        <article className="panel wide">
          <h2>Allocations</h2>
          <p>The actor id is the name you choose. Provisioning draws from the shared grant and does not create a login key.</p>
          <form
            className="cluster"
            onSubmit={(event) => {
              event.preventDefault();
              void allocationCommand("provision", { actorId, amount, label });
            }}
          >
            <label>
              Actor id (required)
              <input value={actorId} onChange={(event) => setActorId(event.target.value)} required autoComplete="off" spellCheck={false} />
            </label>
            <label>
              Amount USD (required)
              <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" required autoComplete="off" />
            </label>
            <label>
              Label (optional)
              <input value={label} onChange={(event) => setLabel(event.target.value)} autoComplete="off" />
            </label>
            <button type="submit">Provision</button>
          </form>
          {allocationError ? <p role="alert">{allocationError}</p> : null}
          {allocation ? (
            <p role="status">
              <bdi>{allocation.actor_id}</bdi> allocation <code>{allocation.allocation_id}</code> is {allocation.status}. Issue an actor key for this id, then sign in with that key.
            </p>
          ) : null}
          <div className="cluster">
            <label>
              Add USD
              <input value={fundAmount} onChange={(event) => setFundAmount(event.target.value)} inputMode="decimal" autoComplete="off" />
            </label>
            <button type="button" onClick={() => void allocationCommand("fund", { actorId, amount: fundAmount })}>
              Fund
            </button>
            <button type="button" className="quiet" onClick={() => void allocationCommand("pause", { actorId })}>
              Pause
            </button>
            <button type="button" className="quiet" onClick={() => void allocationCommand("resume", { actorId })}>
              Resume
            </button>
            <button type="button" className="quiet" onClick={() => void allocationCommand("rotate", { actorId })}>
              Rotate payment key
            </button>
            {confirmRevoke ? (
              <button type="button" onClick={() => void allocationCommand("revoke", { actorId })}>
                Confirm revoke
              </button>
            ) : (
              <button type="button" className="quiet" onClick={() => setConfirmRevoke(true)}>
                Revoke
              </button>
            )}
          </div>
        </article>
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

function isProvisioned(value: unknown): value is ProvisionedActor {
  return (
    isRecord(value) &&
    typeof value.actor_id === "string" &&
    typeof value.allocation_id === "string" &&
    typeof value.status === "string"
  );
}
