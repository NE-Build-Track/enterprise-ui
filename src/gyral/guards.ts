import { isJob, isRecord } from "@/lib/engine/errors";
import type { AccessKey, Allowance, CostSummary, JobCost, Offering, Reconciliation, Runner } from "@/lib/engine/types";
import type { ActorSnapshot } from "@/lib/attribution";

export function orNull<T>(guard: (value: unknown) => value is T): (value: unknown) => value is T | null {
  return (value): value is T | null => value === null || guard(value);
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function isAllowance(value: unknown): value is Allowance {
  return isRecord(value) && typeof value.allocation_id === "string" && typeof value.status === "string";
}

export function isCostSummary(value: unknown): value is CostSummary {
  return isRecord(value) && isRecord(value.by_class) && typeof value.jobs_pending === "number";
}

export function isReconciliation(value: unknown): value is Reconciliation {
  return isRecord(value) && typeof value.allocation_id === "string" && "balanced" in value;
}

export function isOffering(value: unknown): value is Offering {
  return isRecord(value) && typeof value.app === "string" && typeof value.runner_count === "number";
}

export function isRunner(value: unknown): value is Runner {
  return isRecord(value) && typeof value.url === "string" && typeof value.app === "string";
}

export function isAccessKey(value: unknown): value is AccessKey {
  return isRecord(value) && typeof value.key_id === "string" && typeof value.actor_id === "string";
}

export function isJobCost(value: unknown): value is JobCost {
  return isRecord(value) && typeof value.job_id === "string" && typeof value.status === "string";
}

export function isActorSnapshot(value: unknown): value is ActorSnapshot {
  return isRecord(value) && typeof value.actorId === "string" && isRecord(value.reconciliation);
}

export function listOf<T>(guard: (value: unknown) => value is T): (value: unknown) => value is readonly T[] {
  return (value): value is readonly T[] => Array.isArray(value) && value.every(guard);
}

export { isJob, isRecord };
