import { http } from "@gyral/http";
import { inputsFor, outputsIn, step } from "@gyral/testing";
import { expect, it } from "vitest";

import { BlockerChecklist } from "./blocker-checklist";
import { CostBreakdown } from "./cost-breakdown";
import { jobBody, JobRunner, type RunnerState } from "./job-runner";
import { JobTimeline } from "./job-timeline";
import { KeyTable } from "./key-table";

const runner: RunnerState = {
  app: "livepeer/video",
  path: "",
  method: "POST",
  payloadText: "",
  prefilled: false,
  operationRef: "ref-1",
  maxAttempts: "1",
  timeoutS: "30",
  capability: "",
  model: "",
  phase: "idle",
  httpStatus: null,
  retryAfter: null,
  countdown: null,
  resultBody: "",
  contentType: "",
  error: "",
  jobId: null,
  conflict: false,
};

it("fills a single-shot example when an offering is chosen", () => {
  const next = step(
    JobRunner.spec,
    runner,
    { _tag: "App", value: "flux-dev" },
    {
      offerings: [
        {
          app: "flux-dev",
          modes: ["single-shot"],
          rate_low: null,
          rate_high: null,
          runner_count: 1,
          ready_count: 1,
          observed_at: "2026-10-13T00:00:00.000Z",
        },
      ],
    },
  );
  expect(next.state.prefilled).toBe(true);
  expect(JSON.parse(next.state.payloadText)).toHaveProperty("prompt");
});

it("posts a job and treats a 409 as the same job", () => {
  const built = jobBody(runner);
  expect(built.ok).toBe(true);
  if (!built.ok) return;
  const submitted = step(JobRunner.spec, runner, { _tag: "Submit", body: built.value });
  expect(submitted.state.phase).toBe("running");
  expect(inputsFor(submitted.commands, http)[0]).toMatchObject({ url: "/api/jobs", method: "POST" });

  const failed = step(JobRunner.spec, submitted.state, {
    _tag: "Failed",
    status: 409,
    message: "exists",
    jobId: "job-1",
    retryAfter: 5,
    conflict: true,
  });
  expect(failed.state.conflict).toBe(true);
  expect(failed.state.countdown).toBe(5);
  expect(outputsIn(failed.commands)).toEqual([
    { _tag: "JobCompleted", jobId: "job-1", conflict: true, operationRef: "ref-1" },
  ]);
});

it("gives every run a new operation ref and reuses it on retry", () => {
  const first = step(JobRunner.spec, runner, { _tag: "Run" });
  const firstCall = inputsFor(first.commands, http)[0];
  expect(firstCall).toMatchObject({ body: { operation_ref: first.state.operationRef } });
  expect(first.state.operationRef).not.toBe(runner.operationRef);

  const second = step(JobRunner.spec, first.state, { _tag: "Run" });
  const secondCall = inputsFor(second.commands, http)[0];
  expect(secondCall).toMatchObject({ body: { operation_ref: second.state.operationRef } });
  expect(second.state.operationRef).not.toBe(first.state.operationRef);

  const retried = step(JobRunner.spec, second.state, { _tag: "Retry" });
  expect(inputsFor(retried.commands, http)[0]).toMatchObject({ body: { operation_ref: second.state.operationRef } });
});

it("rejects a payload that is not an object", () => {
  const result = jobBody({ ...runner, payloadText: "[]" });
  expect(result.ok).toBe(false);
});

it("asks before revoking a key", () => {
  const asked = step(KeyTable.spec, { actorId: "", label: "", pendingKeyId: "" }, { _tag: "Ask", keyId: "key_1" });
  const confirmed = step(KeyTable.spec, asked.state, { _tag: "Confirm" });
  expect(outputsIn(confirmed.commands)).toEqual([{ _tag: "RevokeKey", keyId: "key_1" }]);
  expect(confirmed.state.pendingKeyId).toBe("");
});

it("emits a cost range from the inputs", () => {
  const changed = step(CostBreakdown.spec, { start: "", end: "" }, { _tag: "Start", value: "2026-10-01T00:00:00.000Z" });
  const applied = step(CostBreakdown.spec, changed.state, { _tag: "Apply" });
  expect(outputsIn(applied.commands)).toEqual([{ _tag: "RangeChanged", start: "2026-10-01T00:00:00.000Z", end: "" }]);
});

it("refuses usage without a quantity", () => {
  const invalid = step(JobTimeline.spec, { name: "", amount: "", formError: "" }, { _tag: "Invalid", message: "Enter a quantity name and a whole number." });
  expect(invalid.state.formError).toContain("whole number");
  const reported = step(JobTimeline.spec, { name: "frames", amount: "3", formError: "" }, {
    _tag: "Report",
    quantities: { frames: 3 },
  });
  expect(outputsIn(reported.commands)).toEqual([{ _tag: "ReportUsage", quantities: { frames: 3 } }]);
});

it("queues one probe job per offering", () => {
  const idle = {
    probePhase: "idle" as const,
    queue: [],
    rows: [],
    probeError: "",
    repeatPhase: "idle" as const,
    firstStatus: null,
    secondStatus: null,
    spendBefore: null,
    spendAfter: null,
    repeatError: "",
  };
  const started = step(BlockerChecklist.spec, idle, { _tag: "Probe" });
  expect(inputsFor(started.commands, http).map((input) => input.url)).toEqual(["/api/offerings"]);
  const queued = step(
    BlockerChecklist.spec,
    started.state,
    { _tag: "Offerings", apps: ["livepeer/video"] },
    { probeNonce: "n", repeatRef: "", repeatApp: "", health: null, healthError: "", actors: [], reserved: [] },
  );
  expect(inputsFor(queued.commands, http)[0]).toMatchObject({ url: "/api/jobs", method: "POST" });
});
