import { failedAfterPayment, hasUnattributed, t9Status, type T9Status } from "./attribution";
import type { ReservedProbe } from "./engine/api";
import type { EngineHealth, Reconciliation } from "./engine/types";
import { baselinePins } from "./pins";
import type { ProbeRow } from "./probe";
import { sameAmount } from "./money";

export type RepeatDemo = {
  readonly operationRef: string;
  readonly firstStatus: number;
  readonly secondStatus: number;
  readonly spendBefore: string | null;
  readonly spendAfter: string | null;
};

export type EvidenceActor = {
  readonly actorId: string;
  readonly applicationId: string;
  readonly reconciliation: Reconciliation | null;
  readonly reconciliationError: string | null;
};

export type EvidenceDocument = {
  readonly generatedAt: string;
  readonly pins: typeof baselinePins;
  readonly health: { readonly status: number; readonly body: EngineHealth } | { readonly error: string };
  readonly actors: readonly EvidenceActor[];
  readonly reserved: readonly ReservedProbe[];
  readonly probe: readonly ProbeRow[];
  readonly repeat: (RepeatDemo & { readonly spendUnchanged: boolean | null }) | null;
  readonly checks: {
    readonly t9: T9Status;
    readonly unattributed: "shown" | "not-shown-live";
    readonly failedAfterPayment: ReturnType<typeof failedAfterPayment>;
  };
};

export function buildEvidence(input: {
  readonly generatedAt: string;
  readonly health: EvidenceDocument["health"];
  readonly actors: readonly EvidenceActor[];
  readonly reserved: readonly ReservedProbe[];
  readonly probe: readonly ProbeRow[];
  readonly repeat: RepeatDemo | null;
}): EvidenceDocument {
  const reconciliations = input.actors.flatMap((actor) =>
    actor.reconciliation ? [actor.reconciliation] : [],
  );
  return {
    generatedAt: input.generatedAt,
    pins: baselinePins,
    health: input.health,
    actors: input.actors,
    reserved: input.reserved,
    probe: input.probe,
    repeat: input.repeat
      ? {
          ...input.repeat,
          spendUnchanged:
            input.repeat.spendBefore === null || input.repeat.spendAfter === null
              ? null
              : sameAmount(input.repeat.spendBefore, input.repeat.spendAfter),
        }
      : null,
    checks: {
      t9: t9Status(reconciliations),
      unattributed: hasUnattributed(reconciliations) ? "shown" : "not-shown-live",
      failedAfterPayment: failedAfterPayment(reconciliations),
    },
  };
}
