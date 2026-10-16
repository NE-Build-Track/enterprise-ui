import type { JobCost } from "./engine/types";

/** Keep a cost already on screen when a later read fails. */
export function nextJobCost(current: JobCost | null | undefined, loaded: JobCost | null): JobCost | null {
  if (loaded === null && current) return current;
  return loaded;
}
