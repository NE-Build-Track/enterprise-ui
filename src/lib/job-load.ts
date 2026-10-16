import { isJob } from "./engine/errors";
import type { Job } from "./engine/types";

/** The usage route returns the job itself. Ignore a body for a different job. */
export function jobFromUsage(body: unknown, requested: string): Job | null {
  if (!isJob(body) || body.id !== requested) return null;
  return body;
}

/** Keep a job that is already on screen when a later refresh fails. */
export function jobAfterLoad(current: Job | null, requested: string, loaded: Job | null, initial: boolean): Job | null {
  if (loaded?.id === requested) return loaded;
  if (initial || (loaded !== null && loaded.id !== requested) || current?.id !== requested) return null;
  return current;
}
