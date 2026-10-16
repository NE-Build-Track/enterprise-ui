import { expect, it } from "vitest";

import type { Job } from "./engine/types";
import { jobAfterLoad } from "./job-load";

const job = (id: string): Job =>
  ({
    id,
    actor_id: "ada",
    application_id: "default",
    app: "comfystream/ffmpeg-compose",
    attempts: [],
    capability: null,
    completed_at: null,
    created_at: "2026-10-14T22:41:00.000Z",
    failure: null,
    mode: "immediate",
    model: null,
    operation_ref: "probe",
    result: null,
    state: "running",
    usage: null,
  }) as Job;

it("keeps the visible job when a later poll fails", () => {
  const current = job("job-a");
  expect(jobAfterLoad(current, "job-a", null, false)).toBe(current);
});

it("clears a job that never loaded", () => {
  expect(jobAfterLoad(null, "job-a", null, true)).toBeNull();
});

it("clears the screen when the response is for a different job", () => {
  expect(jobAfterLoad(job("job-a"), "job-b", job("job-a"), false)).toBeNull();
});

it("replaces the screen with the job that was requested", () => {
  const next = job("job-b");
  expect(jobAfterLoad(job("job-a"), "job-b", next, true)).toBe(next);
});
