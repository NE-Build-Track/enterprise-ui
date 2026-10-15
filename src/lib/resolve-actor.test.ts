import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, it } from "vitest";

import { createEngineCall } from "./engine/client";
import { rememberKey } from "./registry";
import { resolveActor } from "./resolve-actor";

const server = setupServer();
let directory: string | undefined;

function calls() {
  return {
    user: createEngineCall("http://engine.test", "lpk_user"),
    admin: createEngineCall("http://engine.test", "lpk_admin"),
  };
}

const allowance = (allocationId: string) => ({
  allocation_id: allocationId,
  status: "active",
  granted: { amount: "1", currency: "USD" },
  spent: { amount: "0", currency: "USD" },
  available: { amount: "1", currency: "USD" },
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(async () => {
  server.resetHandlers();
  process.env.LPB_KEY_REGISTRY = undefined;
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});
afterAll(() => server.close());

it("keeps an actor id already on the session", async () => {
  const { user, admin } = calls();
  await expect(
    resolveActor(user, admin, "lpk_user", { actorId: "ada", applicationId: "default" }),
  ).resolves.toEqual({ actorId: "ada", applicationId: "default" });
});

it("reads the actor id from the local registry", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "lp-actor-"));
  process.env.LPB_KEY_REGISTRY = path.join(directory, "keys.json");
  await rememberKey("lpk_user", {
    keyId: "key_ada",
    actorId: "ada",
    applicationId: "default",
    kind: "actor",
    label: "ada",
    issuedAt: "2026-10-13T00:00:00Z",
  });
  const { user, admin } = calls();
  await expect(resolveActor(user, admin, "lpk_user", { actorId: null, applicationId: "default" })).resolves.toEqual({
    actorId: "ada",
    applicationId: "default",
  });
});

it("matches a key issued elsewhere to the one actor with the same allocation", async () => {
  server.use(
    http.get("http://engine.test/v1/allowance", ({ request }) => {
      const actorId = new URL(request.url).searchParams.get("actor_id");
      if (actorId === "ada") return HttpResponse.json(allowance("alloc_ada"));
      if (actorId === "operator") return HttpResponse.json(allowance("alloc_operator"));
      return HttpResponse.json(allowance("alloc_operator"));
    }),
    http.get("http://engine.test/v1/admin/keys", () =>
      HttpResponse.json([
        {
          key_id: "key_admin",
          kind: "admin",
          actor_id: "operator",
          application_id: "default",
          permissions: [],
          label: "bootstrap",
          created_at: "2026-10-13T00:00:00Z",
          revoked_at: null,
        },
        {
          key_id: "key_ada",
          kind: "actor",
          actor_id: "ada",
          application_id: "default",
          permissions: [],
          label: "ada",
          created_at: "2026-10-13T00:00:00Z",
          revoked_at: null,
        },
      ]),
    ),
  );
  const { user, admin } = calls();
  await expect(resolveActor(user, admin, "lpk_user", { actorId: null, applicationId: "default" })).resolves.toEqual({
    actorId: "operator",
    applicationId: "default",
  });
});

it("refuses to guess when the allocation is shared", async () => {
  server.use(
    http.get("http://engine.test/v1/allowance", () => HttpResponse.json(allowance("shared"))),
    http.get("http://engine.test/v1/admin/keys", () =>
      HttpResponse.json([
        {
          key_id: "key_a",
          kind: "actor",
          actor_id: "ada",
          application_id: "default",
          permissions: [],
          label: "ada",
          created_at: "2026-10-13T00:00:00Z",
          revoked_at: null,
        },
        {
          key_id: "key_b",
          kind: "actor",
          actor_id: "bea",
          application_id: "default",
          permissions: [],
          label: "bea",
          created_at: "2026-10-13T00:00:00Z",
          revoked_at: null,
        },
      ]),
    ),
  );
  const { user, admin } = calls();
  await expect(resolveActor(user, admin, "lpk_user", { actorId: null, applicationId: "default" })).resolves.toBeNull();
});

it("leaves the actor unknown when the key has no allocation", async () => {
  server.use(http.get("http://engine.test/v1/allowance", () => HttpResponse.json({ error: "no allocation" }, { status: 404 })));
  const { user, admin } = calls();
  await expect(resolveActor(user, admin, "lpk_user", { actorId: null, applicationId: "default" })).resolves.toBeNull();
});
