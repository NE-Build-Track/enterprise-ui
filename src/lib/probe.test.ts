import { expect, it } from "vitest";

import type { Job } from "./engine/types";
import { probeRow, verdictForJob } from "./probe";

const job = (overrides: Partial<Job>): Job =>
  ({
    id: "00000000-0000-0000-0000-000000000001",
    actor_id: "ada",
    application_id: "default",
    operation_ref: null,
    mode: "immediate",
    app: "livepeer/video",
    capability: null,
    model: null,
    state: "failed",
    attempts: [],
    failure: null,
    result: null,
    usage: null,
    created_at: "2026-10-13T00:00:00Z",
    completed_at: null,
    ...overrides,
  }) as Job;

it("classifies a signer recipient mismatch as payment_refused", () => {
  const refused = job({
    attempts: [
      {
        job_id: "00000000-0000-0000-0000-000000000001",
        number: 1,
        runner_url: "https://runner",
        orchestrator_url: "https://orch",
        allocation_id: null,
        sessions: [],
        payment_sent: false,
        outcome: "payment_refused",
        status_code: 400,
        started_at: "2026-10-13T00:00:00Z",
        ended_at: "2026-10-13T00:00:01Z",
      },
    ],
  });
  expect(verdictForJob(refused, 400)).toBe("payment_refused");
  expect(probeRow("livepeer/video", refused, 400).orchestratorUrl).toBe("https://orch");
  expect(verdictForJob(job({ state: "succeeded" }), 200)).toBe("accepted");
  expect(verdictForJob(job({ failure: { kind: "unreachable", message: "down", payment_sent: false } }), 503)).toBe(
    "other",
  );
});
