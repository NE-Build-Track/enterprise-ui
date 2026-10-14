import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { readyz, reservedProbes, runJob } from "./api";
import { createEngineCall } from "./client";
import { EngineRequestError } from "./errors";

const server = setupServer();
const call = () => createEngineCall("http://engine.test", "lpk_test");

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

it("returns a readiness body when the engine is not ready", async () => {
  server.use(
    http.get("http://engine.test/readyz", () =>
      HttpResponse.json(
        {
          ready: false,
          discovery_fresh: false,
          discovery_observed_at: null,
          discovery_error: "down",
          cost_sync_at: null,
          cost_sync_error: null,
          running_jobs: 0,
          allocation_mode: "per_actor",
          version: "m2",
        },
        { status: 503 },
      ),
    ),
  );
  const ready = await readyz(call());
  expect(ready.status).toBe(503);
  expect(ready.health.version).toBe("m2");
  expect(ready.health.ready).toBe(false);
});

it("keeps the runner body and the job id header", async () => {
  server.use(
    http.post("http://engine.test/v1/jobs", () =>
      new HttpResponse("not json", {
        status: 200,
        headers: { "content-type": "text/plain", "livepeer-job-id": "job-9" },
      }),
    ),
  );
  const run = await runJob(call(), {
    app: "livepeer/video",
    path: "",
    method: "POST",
    mode: "immediate",
    max_attempts: 1,
    timeout_s: 30,
  });
  expect(run).toMatchObject({ status: 200, body: "not json", jobId: "job-9", contentType: "text/plain" });
});

it("maps a reserved 501 onto milestone and ticket", async () => {
  server.use(
    http.get("http://engine.test/v1/events", () =>
      HttpResponse.json({ error: "not in this milestone", milestone: "M3", ticket: "events" }, { status: 501 }),
    ),
    http.post("http://engine.test/v1/sessions", () =>
      HttpResponse.json({ error: "not in this milestone", milestone: "M4", ticket: "ISS-27" }, { status: 501 }),
    ),
    http.get("http://engine.test/v1/jobs/:id/result", () =>
      HttpResponse.json({ error: "not in this milestone", milestone: "M4", ticket: "ISS-26" }, { status: 501 }),
    ),
  );
  const probes = await reservedProbes(call());
  expect(probes.map((probe) => [probe.status, probe.milestone, probe.ticket])).toEqual([
    [501, "M3", "events"],
    [501, "M4", "ISS-27"],
    [501, "M4", "ISS-26"],
  ]);
});

it("throws a typed error for an unknown key", async () => {
  server.use(
    http.get("http://engine.test/readyz", () => HttpResponse.json({ error: "unknown or revoked key" }, { status: 401 })),
  );
  await expect(readyz(call())).rejects.toBeInstanceOf(EngineRequestError);
});
