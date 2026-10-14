import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { EngineRequestError } from "./engine/errors";
import { authenticateKey } from "./login";
import { rememberKey } from "./registry";

const server = setupServer();
let directory: string | undefined;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(async () => {
  server.resetHandlers();
  process.env.LPB_KEY_REGISTRY = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
afterAll(() => server.close());

it("rejects an unknown key and accepts an unprovisioned actor key", async () => {
  server.use(
    http.get("http://engine.test/v1/allowance", () => HttpResponse.json({ error: "unknown or revoked key" }, { status: 401 })),
  );
  await expect(authenticateKey("http://engine.test", "lpk_missing")).rejects.toMatchObject({ status: 401 });

  server.use(
    http.get("http://engine.test/v1/allowance", () => HttpResponse.json({ error: "no allocation" }, { status: 404 })),
    http.get("http://engine.test/v1/admin/keys", () => HttpResponse.json({ error: "admin credential required" }, { status: 403 })),
  );
  const login = await authenticateKey("http://engine.test", "lpk_actor");
  expect(login).toMatchObject({ role: "actor", provisioned: false, actorId: null });
});

it("resolves the actor id from the local registry and recognizes an operator", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "lp-login-"));
  process.env.LPB_KEY_REGISTRY = path.join(directory, "keys.json");
  await rememberKey("lpk_ada", {
    keyId: "key_ada",
    actorId: "ada",
    applicationId: "default",
    kind: "actor",
    label: "ada",
    issuedAt: "2026-10-13T00:00:00Z",
  });
  server.use(
    http.get("http://engine.test/v1/allowance", () =>
      HttpResponse.json({
        allocation_id: "alloc",
        status: "active",
        granted: { amount: "1", currency: "USD" },
        spent: { amount: "0", currency: "USD" },
        available: { amount: "1", currency: "USD" },
      }),
    ),
    http.get("http://engine.test/v1/admin/keys", () => HttpResponse.json({ error: "no" }, { status: 403 })),
  );
  expect(await authenticateKey("http://engine.test", "lpk_ada")).toMatchObject({
    role: "actor",
    actorId: "ada",
    provisioned: true,
  });

  server.use(
    http.get("http://engine.test/v1/allowance", () => HttpResponse.json({ error: "no allocation" }, { status: 404 })),
    http.get("http://engine.test/v1/admin/keys", () => HttpResponse.json([])),
  );
  expect(await authenticateKey("http://engine.test", "lpk_admin")).toMatchObject({ role: "operator", provisioned: false });
  expect(new EngineRequestError(401, "x", { job: null, retryAfter: null, jobId: null, milestone: null, ticket: null })).toBeInstanceOf(
    EngineRequestError,
  );
});
