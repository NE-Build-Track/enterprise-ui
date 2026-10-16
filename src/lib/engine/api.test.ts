import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { createGrant, jobResult, listGrants, provisionActor, readyz, reservedProbes, runJob } from "./api";
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

it("returns stored result bytes without decoding them as text", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
  server.use(
    http.get("http://engine.test/v1/jobs/:id/result", () =>
      new HttpResponse(png, {
        status: 200,
        headers: { "content-type": "image/png", "livepeer-job-id": "job-1" },
      }),
    ),
  );
  const result = await jobResult(call(), "job-1");
  expect(result.bytes).toEqual(png);
  expect(result.contentType).toBe("image/png");
  expect(result.jobId).toBe("job-1");
});

it("provisions an actor allocation in USD", async () => {
  let body: unknown;
  server.use(
    http.post(
      "http://engine.test/v1/admin/applications/:application/actors/:actor/allocation",
      async ({ request, params }) => {
        body = await request.json();
        expect(params.application).toBe("default");
        expect(params.actor).toBe("ada");
        return HttpResponse.json(
          {
            application_id: "default",
            actor_id: "ada",
            grant_id: "grant",
            allocation_id: "alloc",
            api_key_id: "pay",
            secret_ref: { ref: "db:1" },
            currency: "USD",
            status: "active",
            created_at: "2026-10-14T00:00:00Z",
            updated_at: "2026-10-14T00:00:00Z",
          },
          { status: 201 },
        );
      },
    ),
  );
  const actor = await provisionActor(call(), {
    applicationId: "default",
    actorId: "ada",
    amount: "1",
    label: "ada",
  });
  expect(body).toEqual({ amount: { amount: "1", currency: "USD" }, label: "ada", grant_id: "" });
  expect(actor.allocation_id).toBe("alloc");
  expect(actor.status).toBe("active");
});

it("provisions an actor from the chosen grant", async () => {
  let body: unknown;
  server.use(
    http.post("http://engine.test/v1/admin/applications/:application/actors/:actor/allocation", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(
        {
          application_id: "default",
          actor_id: "ada",
          grant_id: "grant-1",
          allocation_id: "alloc",
          api_key_id: "pay",
          secret_ref: { ref: "db:1" },
          currency: "USD",
          status: "active",
          created_at: "2026-10-14T00:00:00Z",
          updated_at: "2026-10-14T00:00:00Z",
        },
        { status: 201 },
      );
    }),
  );
  await provisionActor(call(), {
    applicationId: "default",
    actorId: "ada",
    amount: "1",
    label: "ada",
    grantId: "grant-1",
  });
  expect(body).toEqual({ amount: { amount: "1", currency: "USD" }, label: "ada", grant_id: "grant-1" });
});

const grantRecord = {
  id: "grant-1",
  name: "Ops",
  status: "active",
  currency: "USD",
  total: "100.00",
};

it("lists a grant with the amount the table renders", async () => {
  server.use(http.get("http://engine.test/v1/admin/grants", () => HttpResponse.json([grantRecord])));
  await expect(listGrants(call())).resolves.toEqual([grantRecord]);
});

it("creates a grant and keeps the returned amount", async () => {
  let body: unknown;
  server.use(
    http.post("http://engine.test/v1/admin/grants", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json(grantRecord, { status: 201 });
    }),
  );
  const grant = await createGrant(call(), "Ops", "100.00");
  expect(body).toEqual({ name: "Ops", amount: { amount: "100.00", currency: "USD" } });
  expect(grant).toEqual(grantRecord);
});

it("rejects a grants body that is not a list", async () => {
  server.use(http.get("http://engine.test/v1/admin/grants", () => HttpResponse.json({ items: [] })));
  await expect(listGrants(call())).rejects.toThrow("the engine did not return a grant list");
});

it("omits a grant that has no total", async () => {
  server.use(
    http.get("http://engine.test/v1/admin/grants", () =>
      HttpResponse.json([{ id: "grant-1", name: "Ops", status: "active", currency: "USD" }]),
    ),
  );
  await expect(listGrants(call())).resolves.toEqual([]);
});

it("rejects a create response that omits the amount", async () => {
  server.use(
    http.post("http://engine.test/v1/admin/grants", () => HttpResponse.json({ id: "grant-1", name: "Ops" }, { status: 201 })),
  );
  await expect(createGrant(call(), "Ops", "100.00")).rejects.toThrow("the engine did not return a grant");
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
