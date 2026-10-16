import type { Job } from "./engine/types";

/** Keep a job that is already on screen when a later refresh fails. */
export function jobAfterLoad(current: Job | null, requested: string, loaded: Job | null, initial: boolean): Job | null {
  if (loaded?.id === requested) return loaded;
  if (initial || (loaded !== null && loaded.id !== requested) || current?.id !== requested) return null;
  return current;
}
