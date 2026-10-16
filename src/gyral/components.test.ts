import { renderToString } from "@gyral/core/internal/server";
import { http } from "@gyral/http";
import { inputsFor, outputsIn, step, viewOf } from "@gyral/testing";
import { expect, it } from "vitest";

import { exampleFromSchema, requestSchema, type SchemaNode } from "@/lib/capability-schema";

import { BlockerChecklist } from "./blocker-checklist";
import { CostBreakdown } from "./cost-breakdown";
import { JobList } from "./job-list";
import { chooseOffering, jobBody, JobRunner, type RunnerState } from "./job-runner";
import { JobTimeline } from "./job-timeline";
import { KeyTable } from "./key-table";

const runner: RunnerState = {
  app: "livepeer/video",
  path: "",
  method: "POST",
  payloadText: "",
  prefilled: false,
  editor: "fields",
  editorChosen: false,
  editorNote: "",
  fieldErrors: {},
  schemaPhase: "idle",
  schemaJson: "",
  requiredKeys: [],
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
  offeringChosen: false,
  query: "",
};

const offering = {
  app: "flux-dev",
  modes: ["single-shot"],
  rate_low: null,
  rate_high: null,
  runner_count: 1,
  ready_count: 1,
  observed_at: "2026-10-13T00:00:00.000Z",
};

it("chooses the last offering, then ffmpeg-compose, then the first", () => {
  const alpha = { ...offering, app: "alpha" };
  const compose = { ...offering, app: "comfystream/ffmpeg-compose" };
  const zeta = { ...offering, app: "zeta" };
  expect(chooseOffering([alpha, compose, zeta], "zeta")).toBe("zeta");
  expect(chooseOffering([alpha, compose, zeta], "gone")).toBe("comfystream/ffmpeg-compose");
  expect(chooseOffering([alpha, zeta], "")).toBe("alpha");
});

it("prefills the default offering once the saved choice is known", () => {
  const alpha = { ...offering, app: "alpha" };
  const compose = { ...offering, app: "comfystream/ffmpeg-compose" };
  const idle = { ...runner, app: "", offeringChosen: false };
  const offerings = [alpha, compose];
  const waiting = step(
    JobRunner.spec,
    idle,
    { _tag: "PropsChanged", props: { offerings, remembered: null }, prev: { offerings: [], remembered: null } },
    { offerings, remembered: null },
  );
  expect(waiting.state.app).toBe("");
  expect(waiting.commands).toHaveLength(0);

  const selected = step(
    JobRunner.spec,
    waiting.state,
    { _tag: "PropsChanged", props: { offerings, remembered: "" }, prev: { offerings, remembered: null } },
    { offerings, remembered: "" },
  );
  expect(selected.state.app).toBe("comfystream/ffmpeg-compose");
  expect(selected.state.prefilled).toBe(false);
  expect(inputsFor(selected.commands, http)[0]).toMatchObject({
    url: "/api/capability-schema?app=comfystream%2Fffmpeg-compose",
    method: "GET",
  });
  const ready = step(JobRunner.spec, selected.state, {
    _tag: "SchemaReady",
    app: "comfystream/ffmpeg-compose",
    schema: { type: "object", properties: { fps: { type: "number", default: 4 } } },
    example: { fps: 4 },
    required: [],
  });
  expect(ready.state.prefilled).toBe(true);
  expect(JSON.parse(ready.state.payloadText)).toEqual({ fps: 4 });
});

it("keeps an offering the user already chose", () => {
  const props = {
    offerings: [{ ...offering, app: "comfystream/ffmpeg-compose" }],
    remembered: "comfystream/ffmpeg-compose",
  };
  const kept = step(
    JobRunner.spec,
    { ...runner, offeringChosen: true },
    { _tag: "PropsChanged", props, prev: { offerings: [], remembered: null } },
    props,
  );
  expect(kept.state.app).toBe("livepeer/video");
  expect(kept.commands).toHaveLength(0);
});

it("loads a request schema when an offering is chosen", () => {
  const next = step(JobRunner.spec, runner, { _tag: "App", value: "flux-dev" }, { offerings: [offering], remembered: null });
  expect(next.state.schemaPhase).toBe("loading");
  expect(next.state.payloadText).toBe("");
  expect(inputsFor(next.commands, http)[0]).toMatchObject({
    url: "/api/capability-schema?app=flux-dev",
    method: "GET",
  });
  const absent = step(JobRunner.spec, next.state, { _tag: "SchemaAbsent", app: "flux-dev" }, { offerings: [offering], remembered: null });
  expect(absent.state.schemaPhase).toBe("absent");
  expect(JSON.parse(absent.state.payloadText)).toHaveProperty("prompt");
});

it("renders images for the images schema and tracks for compose", () => {
  const images = requestSchema({
    format: "comfystream.ffmpeg.request.v1",
    type: "object",
    required: ["images"],
    properties: {
      fps: { default: 4, type: "number" },
      images: {
        minItems: 1,
        type: "array",
        items: {
          type: "object",
          required: ["url"],
          properties: {
            frames: { default: 1, type: "integer" },
            url: { type: "string" },
          },
        },
      },
    },
  });
  if (!images.ok) throw new Error(images.error);
  const imagesState = readyState("comfystream/ffmpeg-images-to-video", images.schema, ["images"]);
  expect(JSON.parse(imagesState.payloadText)).toMatchObject({ images: [{ url: expect.any(String) }] });
  expect(JSON.parse(imagesState.payloadText)).not.toHaveProperty("tracks");
  const imagesHtml = renderToString(viewOf(JobRunner, imagesState, { props: { offerings: [], remembered: null } }), { dev: false });
  expect(imagesHtml).toContain('data-path="fps"');
  expect(imagesHtml).toContain("<summary>images</summary>");
  expect(imagesHtml).not.toContain("<summary>tracks</summary>");
  expect(imagesHtml).not.toContain("<textarea");

  const compose = requestSchema({
    format: "comfystream.ffmpeg.request.v1",
    type: "object",
    required: ["tracks"],
    properties: {
      fps: { default: 4, type: "number" },
      tracks: {
        minItems: 1,
        type: "array",
        items: {
          type: "object",
          required: ["keyframes"],
          properties: {
            id: { type: "string" },
            type: { enum: ["video", "audio", "image"], type: "string" },
            keyframes: {
              minItems: 1,
              type: "array",
              items: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string" },
                  timestamp: { minimum: 0, type: "number" },
                  duration: { description: "Length of this keyframe in milliseconds.", minimum: 0, type: "number" },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!compose.ok) throw new Error(compose.error);
  const composeState = readyState("comfystream/ffmpeg-compose", compose.schema, ["tracks"]);
  expect(JSON.parse(composeState.payloadText)).toHaveProperty("tracks");
  expect(JSON.parse(composeState.payloadText)).not.toHaveProperty("images");
  const composeHtml = renderToString(viewOf(JobRunner, composeState, { props: { offerings: [], remembered: null } }), { dev: false });
  expect(composeHtml).toContain("<summary>tracks</summary>");
  expect(composeHtml).toContain('value="image" selected');
  const jsonHtml = renderToString(viewOf(JobRunner, { ...composeState, editor: "json" }, { props: { offerings: [], remembered: null } }), { dev: false });
  expect(jsonHtml).toContain("<textarea");
  expect(jsonHtml).not.toContain('data-path="fps"');
  const switched = step(JobRunner.spec, composeState, { _tag: "Editor", value: "json" });
  expect(switched.state.editor).toBe("json");
  expect(switched.state.payloadText).toBe(composeState.payloadText);
});

it("blocks the form when the schema hash does not match", () => {
  const blocked = step(JobRunner.spec, { ...runner, app: "comfystream/ffmpeg-compose" }, {
    _tag: "SchemaBlocked",
    app: "comfystream/ffmpeg-compose",
    message: "schema hash does not match discovery",
  });
  expect(blocked.state.payloadText).toBe("");
  expect(blocked.state.schemaPhase).toBe("blocked");
  const html = renderToString(viewOf(JobRunner, blocked.state, { props: { offerings: [], remembered: null } }), { dev: false });
  expect(html).toContain("schema hash does not match discovery");
  expect(html).not.toContain("schema-fields");
  expect(jobBody(blocked.state).ok).toBe(false);
});

it("does not submit a body that omits a schema-required key", () => {
  const result = jobBody({
    ...runner,
    app: "comfystream/ffmpeg-images-to-video",
    schemaPhase: "ready",
    requiredKeys: ["images"],
    payloadText: JSON.stringify({ fps: 4, tracks: [] }),
  });
  expect(result).toMatchObject({ ok: false, message: "images is required" });
});

function readyState(app: string, schema: SchemaNode, required: readonly string[]): RunnerState {
  const example = exampleFromSchema(schema);
  return {
    ...runner,
    app,
    schemaPhase: "ready",
    schemaJson: JSON.stringify(schema),
    requiredKeys: required,
    payloadText: JSON.stringify(example, null, 2),
    prefilled: true,
  };
}

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
    { _tag: "JobCompleted", jobId: "job-1", conflict: true, operationRef: "ref-1", request: built.value, result: null },
  ]);
});

it("gives every run a new operation ref and ignores a second click while running", () => {
  const first = step(JobRunner.spec, runner, { _tag: "Run" });
  const firstCall = inputsFor(first.commands, http)[0];
  expect(firstCall).toMatchObject({ body: { operation_ref: first.state.operationRef } });
  expect(first.state.operationRef).not.toBe(runner.operationRef);

  const ignored = step(JobRunner.spec, first.state, { _tag: "Run" });
  expect(ignored.state.operationRef).toBe(first.state.operationRef);
  expect(inputsFor(ignored.commands, http)).toHaveLength(0);

  const finished = step(JobRunner.spec, first.state, {
    _tag: "Finished",
    status: 200,
    contentType: "application/json",
    body: "",
    jobId: "job-1",
  });
  const second = step(JobRunner.spec, finished.state, { _tag: "Run" });
  expect(second.state.operationRef).not.toBe(first.state.operationRef);
  expect(inputsFor(second.commands, http)[0]).toMatchObject({ body: { operation_ref: second.state.operationRef } });
});

it("keeps entered values when a required field is missing", () => {
  const state = {
    ...runner,
    app: "comfystream/ffmpeg-images-to-video",
    schemaPhase: "ready" as const,
    requiredKeys: ["images"],
    payloadText: JSON.stringify({ fps: 4 }),
  };
  const next = step(JobRunner.spec, state, { _tag: "Run" });
  expect(next.state.payloadText).toBe(state.payloadText);
  expect(next.state.fieldErrors.images).toBe("images is required");
  expect(next.state.phase).toBe("failed");
});

it("stays on JSON when the payload cannot be shown as fields", () => {
  const state = {
    ...runner,
    editor: "json" as const,
    schemaPhase: "ready" as const,
    schemaJson: JSON.stringify({ type: "object", required: ["fps"], properties: { fps: { type: "number" } } }),
    payloadText: JSON.stringify({ fps: { bad: true } }),
  };
  const next = step(JobRunner.spec, state, { _tag: "Editor", value: "fields" });
  expect(next.state.editor).toBe("json");
  expect(next.state.editorNote).toContain("fps");
  expect(next.state.payloadText).toBe(state.payloadText);
});

it("rejects a payload that is not an object", () => {
  const result = jobBody({ ...runner, payloadText: "[]" });
  expect(result.ok).toBe(false);
});

const keys = { actorId: "", label: "", pendingKeyId: "", copied: false, dismissed: false, copyError: "" };

it("asks before revoking a key", () => {
  const asked = step(KeyTable.spec, keys, { _tag: "Ask", keyId: "key_1" });
  const confirmed = step(KeyTable.spec, asked.state, { _tag: "Confirm" });
  expect(outputsIn(confirmed.commands)).toEqual([{ _tag: "RevokeKey", keyId: "key_1" }]);
  expect(confirmed.state.pendingKeyId).toBe("");
});

it("shows an issued key in one field and removes it when closed", () => {
  const issued = { token: "lpk_test", actorId: "ada" };
  const props = { keys: [], error: "", issued };
  const html = renderToString(viewOf(KeyTable, keys, { props }), { dev: false });
  expect(html).toContain('class="once-row"');
  expect(html).toContain('class="secret"');
  expect(html).toContain('value="lpk_test"');
  expect(html).toContain(">Copy<");
  expect(html).toContain(">Close<");
  expect(html).not.toContain("<code>lpk_test</code>");

  const copied = step(KeyTable.spec, keys, { _tag: "Copy", token: "lpk_test" });
  expect(inputsFor(copied.commands, { name: "clipboard" })).toEqual(["lpk_test"]);

  const dismissed = step(KeyTable.spec, keys, { _tag: "Dismiss" });
  expect(outputsIn(dismissed.commands, KeyTable)).toEqual([{ _tag: "DismissKey" }]);
  const hidden = renderToString(viewOf(KeyTable, dismissed.state, { props }), { dev: false });
  expect(hidden).not.toContain("lpk_test");
});

it("emits a cost range from the inputs", () => {
  const changed = step(CostBreakdown.spec, { start: "", end: "" }, { _tag: "Start", value: "2026-10-01" });
  const ended = step(CostBreakdown.spec, changed.state, { _tag: "End", value: "2026-10-14" });
  const applied = step(CostBreakdown.spec, ended.state, { _tag: "Apply" });
  expect(outputsIn(applied.commands)).toEqual([
    {
      _tag: "RangeChanged",
      start: new Date(2026, 9, 1, 0, 0, 0, 0).toISOString(),
      end: new Date(2026, 9, 14, 23, 59, 59, 999).toISOString(),
    },
  ]);
  const cleared = step(CostBreakdown.spec, ended.state, { _tag: "End", value: "" });
  expect(cleared.state.end).toBe("");

  const fees = { fee_usd: "1", fee_eth: "1", row_count: 1 };
  const html = renderToString(
    viewOf(
      CostBreakdown,
      { start: "2026-10-01T00:00:00.000Z", end: "2026-10-14T00:00:00.000Z" },
      {
        props: {
          summary: {
            by_class: {
              delivered: { ...fees, fee_usd: "3" },
              failed_after_payment: fees,
              uncertain: { ...fees, fee_usd: "0" },
              pending: { ...fees, fee_usd: "0" },
            },
            end: "2026-10-14T00:00:00.000Z",
            jobs_pending: 1,
            jobs_with_cost: 2,
            start: "2026-10-01T00:00:00.000Z",
          },
          error: "",
          start: "2026-10-01T00:00:00.000Z",
          end: "2026-10-14T00:00:00.000Z",
        },
      },
    ),
    { dev: false },
  );
  expect(html).toContain('type="date"');
  expect(html).toContain("bar wide");
});

it("shows each job with a status label and a details link", () => {
  const html = renderToString(
    viewOf(JobList, {}, {
      props: {
        jobs: [
          {
            id: "job-1",
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
            operation_ref: "probe-2c962d89-162d-41e1-9aeb-c880c3e131f7",
            result: null,
            state: "uncertain",
            usage: null,
          },
        ],
        error: "",
        currency: "USD",
        costs: [],
      },
    }),
    { dev: false },
  );
  expect(html).toContain(">Job<");
  expect(html).toContain(">Status<");
  expect(html).toContain(">Submitted<");
  expect(html).toContain("Compose media");
  expect(html).toContain("Uncertain");
  expect(html).toContain("Awaiting cost");
  expect(html).toContain("View details");
  expect(html).toContain('datetime="2026-10-14T22:41:00.000Z"');
  expect(html).not.toContain("Retry last job");
});

function jobListEach(value: unknown): { readonly items: readonly unknown[]; readonly pick: (item: unknown) => unknown } | null {
  if (!value || typeof value !== "object") return null;
  if ("pick" in value && "items" in value && typeof value.pick === "function" && Array.isArray(value.items)) {
    return { items: value.items, pick: value.pick as (item: unknown) => unknown };
  }
  const nested = "values" in value && Array.isArray(value.values) ? value.values : Array.isArray(value) ? value : [];
  for (const child of nested) {
    const found = jobListEach(child);
    if (found) return found;
  }
  return null;
}

it("shows an observed sub-cent fee in the jobs table", () => {
  const cost = {
    job_id: "job-1",
    status: "observed" as const,
    fees: { fee_eth: "4.10026156E-10", fee_usd: "9.97880655857E-7", row_count: 1 },
    attempts: [],
    first_observed_at: "2026-10-16T01:41:10.000Z",
    updated_at: "2026-10-16T01:41:10.000Z",
  };
  const view = viewOf(JobList, {}, {
    props: {
      jobs: [
        {
          id: "job-1",
          actor_id: "ada",
          application_id: "default",
          app: "comfystream/ffmpeg-compose",
          attempts: [],
          capability: null,
          completed_at: "2026-10-16T01:41:04.000Z",
          created_at: "2026-10-16T01:41:00.000Z",
          failure: null,
          mode: "immediate",
          model: null,
          operation_ref: "probe-2c962d89-162d-41e1-9aeb-c880c3e131f7",
          result: { storage: "inline", url: null },
          state: "succeeded",
          usage: null,
        },
      ],
      error: "",
      currency: "USD",
      costs: [cost],
    },
  });
  const picked = jobListEach(view);
  if (!picked) throw new Error("job list each() is missing");
  expect(picked.pick(picked.items[0])).toEqual({ cost, currency: "USD" });
  const html = renderToString(view, { dev: false });
  expect(html).toContain("&lt;$0.01");
  expect(html).not.toContain("Awaiting cost");
  expect(html).toContain('datetime="2026-10-16T01:41:00.000Z"');
});

it("names the estimate and opens the finished job", () => {
  const html = renderToString(viewOf(JobRunner, runner, { props: { offerings: [], remembered: null } }), { dev: false });
  expect(html).toContain("Estimate unavailable");
  expect(html).not.toContain("Retry last job");
  const viewed = step(JobRunner.spec, { ...runner, jobId: "job-1" }, { _tag: "View" });
  const built = jobBody({ ...runner, jobId: "job-1" });
  expect(outputsIn(viewed.commands)).toEqual([
    {
      _tag: "JobCompleted",
      jobId: "job-1",
      conflict: false,
      operationRef: "ref-1",
      request: built.ok ? built.value : null,
      result: null,
    },
  ]);
});

it("carries the runner result onto the finished job", () => {
  const state = { ...runner, phase: "running" as const };
  const built = jobBody(state);
  const finished = step(JobRunner.spec, state, {
    _tag: "Finished",
    status: 200,
    contentType: "application/json",
    body: "{\"ok\":true}",
    jobId: "job-1",
  });
  expect(outputsIn(finished.commands)).toEqual([
    {
      _tag: "JobCompleted",
      jobId: "job-1",
      conflict: false,
      operationRef: "ref-1",
      request: built.ok ? built.value : null,
      result: { body: "{\"ok\":true}", contentType: "application/json" },
    },
  ]);
});

it("explains a failed job and offers run again", () => {
  const html = renderToString(
    viewOf(
      JobTimeline,
      { name: "", amount: "", formError: "" },
      {
        props: {
          job: {
            id: "job-1",
            actor_id: "ada",
            application_id: "default",
            app: "comfystream/ffmpeg-compose",
            attempts: [],
            capability: null,
            completed_at: "2026-10-14T22:42:00.000Z",
            created_at: "2026-10-14T22:41:00.000Z",
            failure: { kind: "runner_error", message: "encoder exited", payment_sent: false },
            mode: "immediate",
            model: null,
            operation_ref: "ref-1",
            result: null,
            state: "failed",
            usage: null,
          },
          cost: null,
          error: "",
          usageError: "",
          currency: "USD",
          repeat: true,
          repeating: false,
        },
      },
    ),
    { dev: false },
  );
  expect(html).toContain("The runner failed while working.");
  expect(html).toContain("new charge");
  expect(html).toContain("Run again");
  expect(html).toContain("Technical details");
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
