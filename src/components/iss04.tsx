"use client";

import { useCallback, useEffect, useState } from "react";

import { GyralElement } from "@/components/GyralElement";
import { api } from "@/lib/client-api";
import { isRecord } from "@/lib/engine/errors";
import type { EngineHealth, Reconciliation } from "@/lib/engine/types";
import type { ReservedProbe } from "@/lib/engine/api";
import { isOffering, isReconciliation, listOf } from "@/gyral/guards";
import { loadBlockerChecklist } from "@/gyral/loaders";
import type { SessionRole } from "@/lib/session-token";

type ActorCheck = { readonly actorId: string; readonly reconciliation: Reconciliation | null; readonly error: string };

const isOfferings = listOf(isOffering);

function isHealth(value: unknown): value is EngineHealth {
  return isRecord(value) && typeof value.ready === "boolean" && typeof value.version === "string";
}

function isReserved(value: unknown): value is ReservedProbe {
  return isRecord(value) && typeof value.route === "string" && typeof value.status === "number";
}

function healthStatus(health: EngineHealth | null, healthError: string): string {
  if (!health) return healthError || "Checking the engine.";
  const freshness = health.discovery_fresh ? "fresh" : "stale";
  return `${health.version}. Discovery ${freshness}.`;
}

export function Iss04({ role, actorId }: { readonly role: SessionRole; readonly actorId: string | null }) {
  const [health, setHealth] = useState<EngineHealth | null>(null);
  const [healthError, setHealthError] = useState("");
  const [actors, setActors] = useState<readonly ActorCheck[]>([]);
  const [reserved, setReserved] = useState<readonly ReservedProbe[]>([]);
  const [repeatApp, setRepeatApp] = useState("");
  const [probeNonce] = useState(() => `probe-${crypto.randomUUID()}`);
  const [repeatRef] = useState(() => `retry-${crypto.randomUUID()}`);

  useEffect(() => {
    void api("/api/health").then((result) => {
      if (!result.ok || !isRecord(result.body)) {
        setHealthError(result.ok ? "Health did not load." : result.error);
        return;
      }
      const ready = result.body.ready;
      if (isRecord(ready) && isHealth(ready.health)) {
        setHealth(ready.health);
        setHealthError(ready.status === 200 ? "" : "Engine is not ready.");
      } else if (isRecord(ready) && typeof ready.error === "string") {
        setHealthError(ready.error);
      }
    });
    void api("/api/reserved").then((result) => {
      setReserved(result.ok && Array.isArray(result.body) ? result.body.filter(isReserved) : []);
    });
    void api("/api/offerings").then((result) => {
      if (result.ok && isOfferings(result.body)) setRepeatApp(result.body[0]?.app ?? "");
    });
    if (role === "operator") {
      void api("/api/operator/actors").then((result) => {
        if (!result.ok || !Array.isArray(result.body)) return;
        setActors(
          result.body.flatMap((item) => {
            if (!isRecord(item) || typeof item.actorId !== "string" || !isRecord(item.reconciliation)) return [];
            const reconciliation = item.reconciliation.ok === true && isReconciliation(item.reconciliation.value) ? item.reconciliation.value : null;
            const error = item.reconciliation.ok === false && typeof item.reconciliation.error === "string" ? item.reconciliation.error : "";
            return [{ actorId: item.actorId, reconciliation, error }];
          }),
        );
      });
    } else if (actorId) {
      void api("/api/reconciliation").then((result) => {
        setActors([
          {
            actorId,
            reconciliation: result.ok && isReconciliation(result.body) ? result.body : null,
            error: result.ok ? "" : result.error,
          },
        ]);
      });
    }
  }, [actorId, role]);

  const onOutput = useCallback((detail: unknown) => {
    if (!isRecord(detail) || detail._tag !== "Download") return;
    void api("/api/evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: detail.probe ?? [], repeat: detail.repeat ?? null }),
    }).then(async (result) => {
      if (!result.ok) return;
      const blob = new Blob([JSON.stringify(result.body, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `iss-04-evidence-${new Date().toISOString()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }, []);

  return (
    <article className="panel">
      <h1>Checks</h1>
      <output>{healthStatus(health, healthError)}</output>
      <GyralElement
        tag="lp-blocker-checklist"
        load={loadBlockerChecklist}
        label="Checks"
        onOutput={onOutput}
        props={{ health, healthError, actors, reserved, probeNonce, repeatRef, repeatApp }}
      />
    </article>
  );
}
